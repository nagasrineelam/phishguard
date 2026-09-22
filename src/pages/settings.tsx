import { useForm } from 'react-hook-form';
import { Loader2, Save, KeyRound, Bell } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/lib/auth-context';
import { useProfile, useUpdatePassword } from '@/lib/queries';
import { useTheme } from '@/lib/theme-context';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

export function SettingsPage() {
  const { profile } = useAuth();
  const { theme, setTheme } = useTheme();
  const updateProfile = useProfile();
  const updatePassword = useUpdatePassword();

  const { register, handleSubmit } = useForm({
    defaultValues: {
      full_name: profile?.full_name ?? '',
      avatar_url: profile?.avatar_url ?? '',
    },
  });

  const passwordForm = useForm<{ password: string; confirmPassword: string }>({
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onProfileSubmit = (values: { full_name: string; avatar_url: string }) => {
    updateProfile.mutate(values);
  };

  const onPasswordSubmit = (values: { password: string; confirmPassword: string }) => {
    if (values.password !== values.confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }
    if (values.password.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }
    updatePassword.mutate(values.password, {
      onSuccess: () => passwordForm.reset(),
    });
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage your account preferences."
        breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Settings' }]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Profile settings */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="glass">
            <CardHeader>
              <CardTitle className="text-base">Profile</CardTitle>
              <CardDescription>Update your personal information</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onProfileSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Full name</Label>
                  <Input id="full_name" {...register('full_name')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="avatar_url">Avatar URL</Label>
                  <Input id="avatar_url" placeholder="https://..." {...register('avatar_url')} />
                </div>
                <Button type="submit" disabled={updateProfile.isPending}>
                  {updateProfile.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save changes
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>

        {/* Password */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="h-4 w-4 text-primary" />
                Password
              </CardTitle>
              <CardDescription>Change your account password</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">New password</Label>
                  <Input id="password" type="password" {...passwordForm.register('password')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <Input id="confirmPassword" type="password" {...passwordForm.register('confirmPassword')} />
                </div>
                <Button type="submit" disabled={updatePassword.isPending}>
                  {updatePassword.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                  Update password
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>

        {/* Theme */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
          <Card className="glass">
            <CardHeader>
              <CardTitle className="text-base">Appearance</CardTitle>
              <CardDescription>Choose your preferred theme</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(['light', 'dark', 'system'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`flex w-full items-center justify-between rounded-lg border p-3 text-sm transition-colors ${
                    theme === t ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
                  }`}
                >
                  <span className="capitalize">{t}</span>
                  {theme === t && <span className="h-2 w-2 rounded-full bg-primary" />}
                </button>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Notifications */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}>
          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="h-4 w-4 text-primary" />
                Notifications
              </CardTitle>
              <CardDescription>Manage your notification preferences</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onProfileSubmit)} className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Email notifications</div>
                    <div className="text-xs text-muted-foreground">Receive updates about your reports</div>
                  </div>
                  <Switch
                    defaultChecked={profile?.notifications_enabled ?? true}
                    onCheckedChange={(checked) => {
                      updateProfile.mutate({ notifications_enabled: checked });
                    }}
                  />
                </div>
                <Separator />
                <p className="text-xs text-muted-foreground">
                  Changes are saved automatically.
                </p>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
