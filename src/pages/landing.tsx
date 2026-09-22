import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  ScanSearch,
  Zap,
  Target,
  Users,
  ArrowRight,
  Lock,
  Globe,
  Activity,
  CheckCircle2,
} from 'lucide-react';
import { Brand } from '@/components/brand';
import { ThemeSwitch } from '@/components/theme-switch';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';

const features = [
  {
    icon: ScanSearch,
    title: 'AI Detection',
    description: 'Advanced machine learning models analyze URLs in real time to flag phishing attempts.',
  },
  {
    icon: Zap,
    title: 'Fast Analysis',
    description: 'Get instant results with detailed risk assessment — no waiting, no friction.',
  },
  {
    icon: Target,
    title: 'High Accuracy',
    description: 'Continuously retrained on verified data for industry-leading detection precision.',
  },
  {
    icon: Users,
    title: 'Crowdsourced Improvement',
    description: 'Community-reported false positives feed back into model retraining.',
  },
];

const stats = [
  { label: 'URLs Analyzed', value: '2.4M+' },
  { label: 'Detection Accuracy', value: '99.5%' },
  { label: 'Avg. Response Time', value: '<7s' },
  { label: 'Threats Blocked', value: '200K+' },
];

export function LandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[40rem] w-[40rem] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />
      <div className="pointer-events-none absolute top-1/3 -right-40 h-[30rem] w-[30rem] rounded-full bg-accent/15 blur-[120px]" />

      {/* Nav */}
      <header className="relative z-20">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Brand />
          <div className="flex items-center gap-2">
            <ThemeSwitch />
            {user ? (
              <Button asChild>
                <Link to="/dashboard">Dashboard</Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild className="hidden sm:inline-flex">
                  <Link to="/login">Login</Link>
                </Button>
                <Button asChild>
                  <Link to="/register">Get Started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-7xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-3xl text-center"
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            AI-Powered Threat Detection
          </div>
          <h1 className="text-balance text-4xl font-extrabold tracking-tight sm:text-6xl">
            AI Powered <span className="gradient-text">Phishing URL</span> Detection
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
            Protect yourself against phishing attacks using AI-powered URL analysis. Paste any
            URL and get an instant, detailed risk assessment.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" className="group h-12 px-8 text-base" onClick={() => navigate(user ? '/analyze' : '/register')}>
              <ScanSearch className="mr-2 h-5 w-5" />
              Analyze URL
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
            <Button size="lg" variant="outline" className="h-12 px-8 text-base" asChild>
              <Link to="/login">Login</Link>
            </Button>
          </div>
        </motion.div>

        {/* Hero visual */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="relative mx-auto mt-16 max-w-4xl"
        >
          <div className="glass-strong relative overflow-hidden rounded-2xl p-1 shadow-2xl">
            <div className="rounded-xl bg-card/80 p-6 backdrop-blur">
              <div className="flex items-center gap-2 border-b border-border/60 pb-4">
                <div className="flex gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-destructive/60" />
                  <span className="h-3 w-3 rounded-full bg-warning/60" />
                  <span className="h-3 w-3 rounded-full bg-success/60" />
                </div>
                <div className="ml-3 flex flex-1 items-center gap-2 rounded-md bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
                  <Lock className="h-3 w-3 text-success" />
                  phishguard.ai/analyze
                </div>
              </div>
              <div className="grid gap-4 py-6 sm:grid-cols-2">
                <div className="rounded-lg border border-border/60 bg-background/60 p-4">
                  <div className="mb-2 text-xs text-muted-foreground">Analyzing</div>
                  <div className="flex items-center gap-2 font-mono text-sm">
                    <Globe className="h-4 w-4 text-accent" />
                    suspicious-login-verify.com
                  </div>
                </div>
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-destructive">Phishing Detected</div>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-destructive">94.6%</span>
                    <Activity className="h-5 w-5 text-destructive" />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {['HTTPS detected', 'IP literal', 'Login page', 'Suspicious TLD'].map((t, i) => (
                  <span
                    key={t}
                    className={
                      i < 1
                        ? 'inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success'
                        : 'inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive'
                    }
                  >
                    {i < 1 ? <CheckCircle2 className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Stats */}
      <section className="relative z-10 border-y border-border/60 bg-card/30 backdrop-blur">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-12 sm:grid-cols-4 sm:px-6">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="text-center"
            >
              <div className="text-3xl font-bold tracking-tight gradient-text sm:text-4xl">{s.value}</div>
              <div className="mt-1 text-sm text-muted-foreground">{s.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Everything you need to stay safe</h2>
          <p className="mt-3 text-muted-foreground">
            Built on a modern AI pipeline, PhishGuard gives you instant, reliable phishing intelligence.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="group glass rounded-2xl p-6 transition-all hover:-translate-y-1 hover:glow"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 text-primary transition-transform group-hover:scale-110">
                <f.icon className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.description}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 mx-auto max-w-7xl px-4 pb-24 sm:px-6">
        <div className="glass-strong relative overflow-hidden rounded-3xl p-10 text-center sm:p-16">
          <div className="absolute -top-20 left-1/2 h-60 w-96 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Start protecting yourself today</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Join thousands of users who rely on PhishGuard to verify URLs before they click.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" className="h-12 px-8 text-base" asChild>
                <Link to="/register">Create free account</Link>
              </Button>
              <Button size="lg" variant="outline" className="h-12 px-8 text-base" asChild>
                <Link to="/login">Sign in</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/60">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <Brand />
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} PhishGuard. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
