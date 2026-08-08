---
doc_type: prd
status: draft
depends_on: []
related: []
last_updated: 2026-08-08
---

# Scribe — PRD

## Problem Statement & Goals

Cloud AI note-takers (Otter, Fireflies, Granola, etc.) require either a bot
joining the call or meeting audio being processed on someone else's servers
— unacceptable for meetings with sensitive content. They also only handle
online calls; a bot can't sit in on an in-person meeting.

Scribe is a fully local AI note-taking app: it records a meeting (online via
mic + speaker/loopback capture, or in-person via mic only), transcribes it
with local models, and generates structured notes — all without any audio,
transcript, or note leaving the machine unless the user explicitly opts a
given step into a cloud model. The goal is to never take meeting notes
manually again, while keeping the privacy guarantee that made building this
worthwhile in the first place.

## Target Persona

| Persona | Needs | Role / Permissions |
|---|---|---|
| The user (you) | Fully local meeting capture and notes without a bot joining calls or audio leaving the machine; organized recall of past meetings and decisions across projects | Sole user, full access, no permission tiers or accounts |

Single-user, local-first tool — no multi-user roles or auth in scope.

## Feature Scope

### Must-haves (MVP)

| ID | Feature | Summary |
|---|---|---|
| `FR-01` | Recording | Select a mic device and a speaker/loopback device, start and stop a recording, save the audio locally. Covers both online meetings (mic + speaker dual-track) and physical meetings (mic-only). No pause/resume, no live transcript preview. |
| `FR-02` | Transcription | Fully local transcription with speaker diarization, producing a single timestamped, speaker-labeled transcript per meeting. Triggered manually per meeting; the transcription model (e.g. whisper large-v3 vs. a faster/smaller variant) is chosen per-recording at that moment, with a default set in Settings. |
| `FR-03` | Notes Generation | Structured notes per meeting: summary, action items, key decisions, and a topic breakdown. Triggered manually, after transcription completes. Generated via a local or cloud model, chosen in settings (cloud is the default; the active choice is always visible to the user). |
| `FR-04` | Projects | Create, rename, and delete projects (delete blocked until the project is empty), with project-level metadata (e.g. description); assign each meeting to a project (or leave unassigned); view/filter meetings by project and by date. |
| `FR-05` | Meeting Chatbot | Chat with a single meeting, answers grounded only in that meeting's transcript and notes. |
| `FR-06` | Project Chatbot | Chat across all meetings within one project, answers synthesized across that project's transcripts and notes only (no cross-project search). |
| `FR-07` | Settings | Local/cloud model choice, configured independently for notes generation and for chat (two separate toggles, not shared); a default transcription model; default mic/speaker devices for new recordings. |

### Nice-to-haves

- Pause/resume during a recording.
- Live transcript preview while recording.
- Manual speaker rename/relabel and segment merge/split in the transcript.
- Full-text search across transcript content (beyond project/date filter).
- Inline citations linking chatbot answers to transcript timestamps.
- Cross-project chatbot search.
- Assigning a meeting to more than one project.

### Out-of-scope

- Calendar integration (auto-joining or auto-creating meetings from
  calendar events).
- A mobile or companion app.
- Multi-device sync of recordings/transcripts.
- Manual transcript text editing (fixing ASR mistakes).
- Multi-user accounts, roles, or permissions.

## User Stories & Acceptance Criteria

| ID | User Story | Implements | Summary |
|---|---|---|---|
| `US-01` | [Record an online meeting](#us-01--record-an-online-meeting) | `FR-01` | Dual-track mic + speaker capture, saved locally |
| `US-02` | [Record a physical meeting](#us-02--record-a-physical-meeting) | `FR-01` | Mic-only capture for in-person meetings |
| `US-03` | [Get a diarized transcript](#us-03--get-a-diarized-transcript) | `FR-02` | Local, speaker-labeled transcript after recording |
| `US-04` | [Get structured meeting notes](#us-04--get-structured-meeting-notes) | `FR-03` | Summary, action items, decisions, topics |
| `US-05` | [Choose local vs cloud for notes](#us-05--choose-local-vs-cloud-for-notes) | `FR-03`, `FR-07` | Model choice toggle, always visible |
| `US-06` | [Organize meetings into projects](#us-06--organize-meetings-into-projects) | `FR-04` | Create projects, assign meetings, filter |
| `US-07` | [Chat with a single meeting](#us-07--chat-with-a-single-meeting) | `FR-05` | Q&A grounded in one meeting's transcript |
| `US-08` | [Chat across a project](#us-08--chat-across-a-project) | `FR-06` | Q&A across all meetings in one project |

### `US-01` — Record an online meeting
**Implements:** `FR-01`
**As a** solo user, **I want** to capture both my mic and the meeting's speaker/loopback audio, **so that** I have a full local recording of an online meeting without a bot joining the call.
**Given** I've selected a mic device and a speaker/loopback device, **When** I start a recording and later stop it, **Then** the app saves the meeting's audio locally, with no audio sent off the device.

### `US-02` — Record a physical meeting
**Implements:** `FR-01`
**As a** solo user, **I want** to record an in-person meeting using just my mic, **so that** I get the same local capture and notes pipeline for meetings a cloud bot could never join.
**Given** I'm in an in-person meeting with no online call running, **When** I start a recording using only my mic device, **Then** the app captures and saves the meeting audio the same way as an online meeting.

### `US-03` — Get a diarized transcript
**Implements:** `FR-02`
**As a** solo user, **I want** a speaker-labeled transcript produced entirely on-device, **so that** I can tell who said what without any audio leaving my machine.
**Given** a completed recording, **When** transcription runs, **Then** I get a single timestamped transcript with speaker labels, produced entirely by local models.

### `US-04` — Get structured meeting notes
**Implements:** `FR-03`
**As a** solo user, **I want** structured notes generated from the transcript, **so that** I never have to write up a summary, action items, or decisions by hand.
**Given** a completed transcript, **When** notes generation runs, **Then** I get a summary, action items, key decisions, and a topic breakdown, generated via my selected local or cloud model.

### `US-05` — Choose local vs cloud for notes
**Implements:** `FR-03`, `FR-07`
**As a** solo user, **I want** to pick and always see whether notes generation is running locally or in the cloud, **so that** I control the privacy/quality tradeoff for each meeting's notes.
**Given** I'm in settings, **When** I toggle notes generation between local and cloud, **Then** subsequent notes generation uses that model, and the active choice is always visible.

### `US-06` — Organize meetings into projects
**Implements:** `FR-04`
**As a** solo user, **I want** to group meetings into projects and filter by project or date, **so that** I can find past meetings and decisions without scrolling through everything.
**Given** one or more recorded meetings, **When** I create a project and assign meetings to it, **Then** I can view and filter meetings by that project and by date.

### `US-07` — Chat with a single meeting
**Implements:** `FR-05`
**As a** solo user, **I want** to ask questions about one meeting, **so that** I can recall specific details without rereading the whole transcript.
**Given** a meeting with a completed transcript, **When** I ask a question in that meeting's chat, **Then** I get an answer grounded only in that meeting's transcript and notes.

### `US-08` — Chat across a project
**Implements:** `FR-06`
**As a** solo user, **I want** to ask questions across all meetings in a project, **so that** I can track decisions and context that span multiple meetings in that project.
**Given** a project with multiple meetings, **When** I ask a question in the project-level chat, **Then** I get an answer synthesized across all meetings' transcripts and notes within that project only.

## Success Metrics (KPIs)

Framework: **HEART** — this is a personal productivity tool, not a
growth-stage product, so usability/outcome metrics fit better than
acquisition-funnel metrics.

| Metric | Target | Measures | How measured |
|---|---|---|---|
| Task success | ≥90% of meetings produce usable notes with zero manual edits | `FR-03` | Track whether generated notes for each meeting were accepted as-is vs. edited/discarded |
| Adoption | 100% of meetings (online + physical) captured via Scribe | `FR-01` | Compare meetings recorded in Scribe against actual meetings held, over a month of daily use |
| Retention | Scribe remains the primary meeting-capture tool after 4 weeks | — | Continued weekly recording activity, no reversion to manual note-taking |
| Engagement | ≥1 chatbot query per meeting on average | `FR-05`, `FR-06` | Chat usage count per meeting/project over a month |

Task success ties to the "never take notes manually again" goal; adoption
and retention validate the privacy-first pitch actually replaces prior
tools; engagement confirms the chatbots deliver value beyond the notes
themselves.
