import PQueue from 'p-queue';

const webhookQueue = new PQueue({ concurrency: 2 });

export function enqueueWebhookTask(task: () => Promise<void>): Promise<void> {
  return webhookQueue.add(task);
}

export function getWebhookQueueSize(): number {
  return webhookQueue.size;
}
