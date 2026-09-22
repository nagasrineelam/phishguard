import { motion } from 'framer-motion';
import { Mail, Calendar, ShieldCheck, User as UserIcon, Activity } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth-context';
import { useUserStats } from '@/lib/queries';

export function ProfilePage() {
  const { profile } = useAuth();
  const { data: stats } = useUserStats();

  const initials = (profile?.full_name || profile?.email || 'U')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div>
      <PageHeader
        title="Profile"
        description="Your PhishGuard account overview."
        breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Profile' }]}
      />

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="glass mb-6 overflow-hidden">
          <div className="h-24 bg-gradient-to-r from-primary/20 via-accent/15 to-primary/10" />
          <CardContent className="pt-0">
            <div className="-mt-12 flex flex-col items-start gap-4 sm:flex-row sm:items-end">
              <Avatar className="h-24 w-24 border-4 border-background">
                <AvatarFallback className="bg-primary/10 text-primary text-2xl font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 pb-2">
                <h2 className="text-xl font-bold">{profile?.full_name || 'User'}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" /> {profile?.email}
                  </span>
                  <Badge variant={profile?.role === 'admin' ? 'default' : 'secondary'}>
                    {profile?.role === 'admin' ? (
                      <><ShieldCheck className="mr-1 h-3 w-3" /> Admin</>
                    ) : (
                      <><UserIcon className="mr-1 h-3 w-3" /> Member</>
                    )}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Member since', value: profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—', icon: Calendar },
          { label: 'URLs analyzed', value: stats?.total ?? 0, icon: Activity },
          { label: 'Threats found', value: stats?.phishing ?? 0, icon: ShieldCheck },
          { label: 'Reports submitted', value: stats?.reports ?? 0, icon: UserIcon },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.06 }}>
            <Card className="glass">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <s.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                    <div className="text-lg font-bold tabular-nums">{s.value}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
