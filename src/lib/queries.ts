import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { phishingApi } from './api';
import { toast } from 'sonner';
import type { AnalysisRecord, AnalysisResult, ModelInfo, ReportRecord, RetrainLog, UserProfile } from './types';
import { summarizeAnalysis } from './analysis';

export const queryKeys = {
  analyses: ['analyses'] as const,
  analysis: (id: string) => ['analysis', id] as const,
  reports: (filters?: { status?: string }) => ['reports', filters] as const,
  modelInfo: ['model-info'] as const,
  retrainLogs: ['retrain-logs'] as const,
  profile: ['profile'] as const,
  health: ['health'] as const,
};

export function useAnalyses(opts?: { search?: string; status?: string; sort?: 'newest' | 'oldest' }) {
  return useQuery<AnalysisRecord[]>({
    queryKey: [queryKeys.analyses, opts],
    queryFn: async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error('Not authenticated');
      let q = supabase
        .from('analyses')
        .select('*')
        .eq('user_id', userData.user.id)
        .order('created_at', { ascending: opts?.sort === 'oldest' });
      if (opts?.search) q = q.or(`url.ilike.%${opts.search}%,title.ilike.%${opts.search}%`);
      if (opts?.status === 'legitimate') q = q.eq('prediction', 'legitimate');
      else if (opts?.status === 'phishing') q = q.eq('prediction', 'phishing');
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AnalysisRecord[];
    },
    staleTime: 30_000,
  });
}

export function useAnalysis(id: string | undefined) {
  return useQuery<AnalysisRecord>({
    queryKey: queryKeys.analysis(id ?? ''),
    queryFn: async () => {
      if (!id) throw new Error('Missing id');
      const { data, error } = await supabase.from('analyses').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Analysis not found');
      return data as AnalysisRecord;
    },
    enabled: !!id,
  });
}

export function useUserStats() {
  return useQuery({
    queryKey: ['user-stats'],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');
      const userId = userData.user.id;
      const { data: analyses, error } = await supabase
        .from('analyses')
        .select('prediction')
        .eq('user_id', userId);
      if (error) throw error;
      const { count: reportsCount } = await supabase
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      const total = analyses?.length ?? 0;
      const legitimate = analyses?.filter((a) => a.prediction === 'legitimate').length ?? 0;
      const phishing = analyses?.filter((a) => a.prediction === 'phishing').length ?? 0;
      return {
        total,
        legitimate,
        phishing,
        reports: reportsCount ?? 0,
      };
    },
    staleTime: 30_000,
  });
}

export function usePredictUrl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (url: string): Promise<AnalysisResult> => {
      const result = await phishingApi.predictUrl(url);
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error('Not authenticated');

      const isPhishing = result.prediction.predicted_label === 0;
      const prediction: 'legitimate' | 'phishing' = isPhishing ? 'phishing' : 'legitimate';
      const confidence = Math.round(
        (isPhishing ? result.prediction.probability_phishing : result.prediction.probability_legitimate) * 1000,
      ) / 10;
      const riskScore = Math.round(result.prediction.probability_phishing * 1000) / 10;
      const probLegit = Math.round(result.prediction.probability_legitimate * 1000) / 10;
      const probPhish = Math.round(result.prediction.probability_phishing * 1000) / 10;

      const summary = summarizeAnalysis(result);
      const indicators = summary.indicators;

      const { data: row, error: insertError } = await supabase
        .from('analyses')
        .insert({
          user_id: userData.user.id,
          url: result.url,
          title: result.extraction.title,
          prediction,
          confidence,
          risk_score: riskScore,
          probability_legitimate: probLegit,
          probability_phishing: probPhish,
          indicators,
          raw_response: result,
        })
        .select('id')
        .single();
      if (insertError) throw insertError;
      return { ...result, id: row.id };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.analyses });
      qc.invalidateQueries({ queryKey: ['user-stats'] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'Analysis failed.';
      toast.error(msg);
    },
  });
}

export function useReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      analysis_id?: string;
      url: string;
      original_prediction: string;
      probability?: number;
      reason: string;
      note?: string;
    }) => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error('Not authenticated');

      const { error } = await supabase.from('reports').insert({
        analysis_id: payload.analysis_id ?? null,
        user_id: userData.user.id,
        url: payload.url,
        original_prediction: payload.original_prediction,
        probability: payload.probability ?? null,
        reason: payload.reason,
        note: payload.note ?? null,
        status: 'pending',
      });
      if (error) throw error;
      return { message: 'Report submitted.' };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-stats'] });
      qc.invalidateQueries({ queryKey: ['pending-reports'] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'Failed to submit report.';
      toast.error(msg);
    },
  });
}
export function useModelInfo() {
  return useQuery<ModelInfo>({
    queryKey: queryKeys.modelInfo,
    queryFn: async () => {
      const { data, error } = await supabase.from('model_info').select('*').eq('id', 1).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Model info unavailable');
      return data as ModelInfo;
    },
    staleTime: 60_000,
  });
}

export function useRetrainLogs() {
  return useQuery<RetrainLog[]>({
    queryKey: queryKeys.retrainLogs,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('retrain_logs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as RetrainLog[];
    },
    refetchInterval: (query) => {
      const logs = query.state.data;
      return logs?.some((l) => l.status === 'running') ? 2000 : false;
    },
  });
}

export function usePendingReports(page: number, perPage: number, search: string) {
  return useQuery({
    queryKey: ['pending-reports', page, perPage, search],
    queryFn: async () => {
      let query = supabase
        .from('reports')
        .select('id, analysis_id, user_id, url, original_prediction, probability, reason, note, status, created_at', { count: 'exact' })
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .range((page - 1) * perPage, page * perPage - 1);
      if (search) query = query.or(`url.ilike.%${search}%,reason.ilike.%${search}%`);
      const { data, error, count } = await query;
      if (error) throw error;
      return { reports: (data ?? []) as ReportRecord[], total: count ?? 0, page, per_page: perPage };
    },
    staleTime: 15_000,
  });
}

export function useVerifiedReports(page: number, perPage: number, search: string) {
  return useQuery({
    queryKey: ['verified-reports', page, perPage, search],
    queryFn: async () => {
      let query = supabase
        .from('reports')
        .select('id, analysis_id, user_id, url, original_prediction, probability, reason, note, status, verified_label, resolved_by, resolved_at, created_at', { count: 'exact' })
        .in('status', ['verified_legitimate', 'verified_phishing', 'rejected'])
        .order('resolved_at', { ascending: false, nullsFirst: false })
        .range((page - 1) * perPage, page * perPage - 1);
      if (search) query = query.or(`url.ilike.%${search}%,reason.ilike.%${search}%`);
      const { data, error, count } = await query;
      if (error) throw error;
      return { reports: (data ?? []) as ReportRecord[], total: count ?? 0, page, per_page: perPage };
    },
    staleTime: 15_000,
  });
}

export function useResolveReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ reportId, action }: { reportId: string; action: 'verify_legitimate' | 'verify_phishing' | 'reject' }) => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error('Not authenticated');

      const statusMap: Record<string, string> = {
        verify_legitimate: 'verified_legitimate',
        verify_phishing: 'verified_phishing',
        reject: 'rejected',
      };
      const update: Record<string, unknown> = {
        status: statusMap[action],
        resolved_by: userData.user.id,
        resolved_at: new Date().toISOString(),
      };
      if (action === 'verify_legitimate') update.verified_label = 'legitimate';
      if (action === 'verify_phishing') update.verified_label = 'phishing';

      const { error } = await supabase.from('reports').update(update).eq('id', reportId);
      if (error) throw error;
      return { message: 'Report resolved.' };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['pending-reports'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
      const labels = {
        verify_legitimate: 'Report verified as legitimate.',
        verify_phishing: 'Report verified as phishing.',
        reject: 'Report rejected.',
      };
      toast.success(labels[vars.action], { duration: 1000 });
    },
  });
}

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: () => phishingApi.health(),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const { count: pending } = await supabase
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      const { count: verified } = await supabase
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .in('status', ['verified_legitimate', 'verified_phishing']);
      const { data: model } = await supabase.from('model_info').select('*').eq('id', 1).maybeSingle();
      const { count: predictions } = await supabase.from('analyses').select('id', { count: 'exact', head: true });
      const { data: recentAnalyses } = await supabase
        .from('analyses')
        .select('prediction, created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      const { data: recentReports } = await supabase
        .from('reports')
        .select('status, created_at')
        .order('created_at', { ascending: false })
        .limit(200);

      // Build daily trend (last 14 days)
      const days: { date: string; legitimate: number; phishing: number }[] = [];
      const now = new Date();
      for (let i = 13; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        days.push({ date: d.toISOString().slice(0, 10), legitimate: 0, phishing: 0 });
      }
      const dayMap = new Map(days.map((d) => [d.date, d]));
      for (const a of recentAnalyses ?? []) {
        const day = a.created_at.slice(0, 10);
        const entry = dayMap.get(day);
        if (entry) {
          if (a.prediction === 'legitimate') entry.legitimate += 1;
          else entry.phishing += 1;
        }
      }

      const reportTrend = days.map((d) => ({ date: d.date, reports: 0 }));
      const rDayMap = new Map(reportTrend.map((d) => [d.date, d]));
      for (const r of recentReports ?? []) {
        const day = r.created_at.slice(0, 10);
        const entry = rDayMap.get(day);
        if (entry) entry.reports += 1;
      }

      return {
        pendingReports: pending ?? 0,
        verifiedReports: verified ?? 0,
        datasetSize: model?.training_dataset_size ?? 0,
        modelVersion: model?.version ?? '—',
        modelAccuracy: model?.accuracy ?? 0,
        predictionCount: predictions ?? 0,
        lastRetraining: model?.training_date ?? null,
        trend: days,
        reportTrend,
      };
    },
    staleTime: 30_000,
  });
}

export function useProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: Partial<Pick<UserProfile, 'full_name' | 'avatar_url' | 'notifications_enabled'>>) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userData.user.id)
        .select('*')
        .single();
      if (error) throw error;
      return data as UserProfile;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.profile });
      toast.success('Profile updated.');
    },
  });
}

export function useUpdatePassword() {
  return useMutation({
    mutationFn: async (newPassword: string) => {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    },
    onSuccess: () => toast.success('Password updated.'),
  });
}