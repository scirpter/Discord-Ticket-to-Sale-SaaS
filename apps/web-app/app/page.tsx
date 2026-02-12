import { ArrowRight, Bot, ShieldCheck, Ticket } from 'lucide-react';

import { ModeToggle } from '@/components/mode-toggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const featureCards = [
  {
    icon: Ticket,
    title: 'Ticket-To-Sale Flow',
    description: 'Collect order questions in Discord tickets and send users straight to provider checkout.',
  },
  {
    icon: Bot,
    title: 'Multi-Tenant Control',
    description: 'Each merchant keeps separate workspace config, products, pricing, and callback security.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure Callback Validation',
    description: 'Each payment callback is verified with signed tokens to block forged confirmations.',
  },
] as const;

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(50rem_30rem_at_20%_-10%,rgba(71,176,255,0.25),transparent),radial-gradient(36rem_26rem_at_85%_10%,rgba(56,189,149,0.2),transparent),radial-gradient(42rem_30rem_at_60%_120%,rgba(251,146,60,0.18),transparent)]" />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="rounded-full border border-border/60 bg-card/80 px-3 py-1 text-xs">
            Voodoo Pay SaaS Dashboard
          </Badge>
          <ModeToggle />
        </div>

        <Card className="overflow-hidden border-border/70 bg-card/80 shadow-2xl shadow-black/20 backdrop-blur">
          <CardHeader className="gap-4">
            <Badge className="w-fit rounded-full bg-primary/90 px-3 py-1 text-[11px] font-semibold tracking-wide text-primary-foreground uppercase">
              Discord Commerce Stack
            </Badge>
            <CardTitle className="text-3xl leading-tight sm:text-4xl">
              Build clean ticket sales with a modern payment dashboard.
            </CardTitle>
            <CardDescription className="max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Login with Discord, configure your workspace, connect your server, set Voodoo Pay details,
              and run sales from tickets with structured logs.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row">
            <Button asChild size="lg" className="sm:w-auto">
              <a href="/api/auth/discord/login">
                Login with Discord
                <ArrowRight className="size-4" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="sm:w-auto">
              <a href="/dashboard">Open Dashboard</a>
            </Button>
          </CardContent>
        </Card>

        <section className="grid gap-4 md:grid-cols-3">
          {featureCards.map(({ icon: Icon, title, description }) => (
            <Card key={title} className="border-border/70 bg-card/70 backdrop-blur">
              <CardHeader className="pb-3">
                <div className="mb-2 inline-flex size-9 items-center justify-center rounded-lg border border-border/60 bg-secondary/50">
                  <Icon className="size-4 text-primary" />
                </div>
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription className="text-sm leading-relaxed text-muted-foreground">
                  {description}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </section>
      </div>
    </main>
  );
}

