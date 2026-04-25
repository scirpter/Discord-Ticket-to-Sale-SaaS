# AI Answer Corrections Design

## Goal

Let Discord administrators mark an AI bot answer as wrong, submit the right answer, and persist that correction as Custom Q&A so future matching questions use the corrected answer.

## Flow

Each successful AI answer includes a persistent Discord button labeled `Mark wrong`. The button custom ID includes the source channel ID and source message ID, so the interaction still works after worker restarts. After sending an answer, the worker stores the original source question in `ai_answer_correction_contexts`. When an administrator clicks the button, the worker loads that stored question and opens a modal with the question prefilled, so the admin only needs to enter the right answer. The admin can still edit the question for better future matching.

On modal submit, the worker saves the question and right answer through the existing `AiKnowledgeManagementService.createCustomQa` path. The original AI answer message is edited so the button becomes disabled and labeled `Correction saved`.

## Permissions

Only members with Discord Administrator permission can open or submit corrections. Non-admin users get an ephemeral error. All correction replies are ephemeral.

## Persistence

The correction button is a normal Discord message component persisted on the bot answer message. The custom ID carries source message identity, while `ai_answer_correction_contexts` stores the original question by guild, source channel, and source message. Saved corrections use existing `ai_custom_qas`.

## Error Handling

If the stored question is missing, the modal still opens with a blank optional question field. If the admin leaves the question blank, the modal submit is deferred ephemerally and the worker fetches the original message before saving. If the original question cannot be fetched, the admin gets an ephemeral error asking them to resubmit with the Question field filled. If saving fails, the worker returns the service error ephemerally. If editing the button fails after saving, the Q&A remains saved and the failure is logged.

## Tests

Worker tests cover answered reply payloads, thread payloads, admin-only correction button access, modal prefill from original message, Q&A save, and disabling the button after save.
