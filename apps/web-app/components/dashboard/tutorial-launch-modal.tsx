'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type TutorialLaunchModalProps = {
  onRunTutorial: () => void;
  onSkipTutorial: () => void;
};

export function TutorialLaunchModal(props: TutorialLaunchModalProps) {
  return (
    <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/65 px-4 backdrop-blur-md">
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-tutorial-title"
        aria-describedby="dashboard-tutorial-description"
        className="w-full max-w-xl border-border/70 bg-gradient-to-br from-card/97 via-card/95 to-accent/20 shadow-2xl shadow-black/45"
      >
        <CardHeader>
          <CardTitle id="dashboard-tutorial-title" className="text-xl tracking-tight">
            Dashboard Tutorial
          </CardTitle>
          <CardDescription id="dashboard-tutorial-description">
            Walk through every dashboard capability with contextual guidance for what each control does, why it matters,
            and when to use it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button autoFocus type="button" className="sm:min-w-36" onClick={props.onRunTutorial}>
            Run Tutorial
          </Button>
          <Button type="button" variant="outline" className="sm:min-w-36" onClick={props.onSkipTutorial}>
            Skip Tutorial
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
