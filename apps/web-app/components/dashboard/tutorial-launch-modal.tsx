'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type TutorialLaunchModalProps = {
  onRunTutorial: () => void;
  onSkipTutorial: () => void;
};

export function TutorialLaunchModal(props: TutorialLaunchModalProps) {
  return (
    <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-tutorial-title"
        aria-describedby="dashboard-tutorial-description"
        className="w-full max-w-xl border-border/80 bg-card/95 shadow-2xl shadow-black/40"
      >
        <CardHeader>
          <CardTitle id="dashboard-tutorial-title" className="text-xl">
            Dashboard Tutorial
          </CardTitle>
          <CardDescription id="dashboard-tutorial-description">
            Start an interactive walkthrough of every dashboard feature, or skip for now and run it later from the
            header button.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button autoFocus type="button" onClick={props.onRunTutorial}>
            Run Tutorial
          </Button>
          <Button type="button" variant="outline" onClick={props.onSkipTutorial}>
            Skip Tutorial
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
