---
doc_type: prd
status: draft
depends_on: []
last_updated: 2026-08-02
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

- **Recording** — select a mic device and a speaker/loopback device, start
  and stop a recording, save the audio locally. Covers both online meetings
  (mic + speaker dual-track) and physical meetings (mic-only). No
  pause/resume, no live transcript preview.
- **Transcription** — fully local transcription with speaker diarization,
  producing a single timestamped, speaker-labeled transcript per meeting.
- **Notes generation** — structured notes per meeting: summary, action
  items, key decisions, and a topic breakdown. Generated via a local or
  cloud model, chosen in settings (cloud is the default; the active choice
  is always visible to the user).
- **Projects** — create and rename projects, with project-level metadata
  (e.g. description); assign each meeting to a project (or leave
  unassigned); view/filter meetings by project and by date.
- **Meeting chatbot** — chat with a single meeting, answers grounded only
  in that meeting's transcript and notes.
- **Project chatbot** — chat across all meetings within one project,
  answers synthesized across that project's transcripts and notes only (no
  cross-project search).
- **Settings** — local/cloud model choice, configured independently for
  notes generation and for chat (two separate toggles, not shared).

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

| User Story | Feature | Summary |
|---|---|---|
| [Record an online meeting](#record-an-online-meeting) | Recording | Dual-track mic + speaker capture, saved locally |
| [Record a physical meeting](#record-a-physical-meeting) | Recording | Mic-only capture for in-person meetings |
| [Get a diarized transcript](#get-a-diarized-transcript) | Transcription | Local, speaker-labeled transcript after recording |
| [Get structured meeting notes](#get-structured-meeting-notes) | Notes Generation | Summary, action items, decisions, topics |
| [Choose local vs cloud for notes](#choose-local-vs-cloud-for-notes) | Notes Generation | Model choice toggle, always visible |
| [Organize meetings into projects](#organize-meetings-into-projects) | Projects | Create projects, assign meetings, filter |
| [Chat with a single meeting](#chat-with-a-single-meeting) | Meeting Chatbot | Q&A grounded in one meeting's transcript |
| [Chat across a project](#chat-across-a-project) | Project Chatbot | Q&A across all meetings in one project |

### Record an online meeting
**Feature:** Recording
**Given** I've selected a mic device and a speaker/loopback device, **When** I start a recording and later stop it, **Then** the app saves the meeting's audio locally, with no audio sent off the device.

### Record a physical meeting
**Feature:** Recording
**Given** I'm in an in-person meeting with no online call running, **When** I start a recording using only my mic device, **Then** the app captures and saves the meeting audio the same way as an online meeting.

### Get a diarized transcript
**Feature:** Transcription
**Given** a completed recording, **When** transcription runs, **Then** I get a single timestamped transcript with speaker labels, produced entirely by local models.

### Get structured meeting notes
**Feature:** Notes Generation
**Given** a completed transcript, **When** notes generation runs, **Then** I get a summary, action items, key decisions, and a topic breakdown, generated via my selected local or cloud model.

### Choose local vs cloud for notes
**Feature:** Notes Generation
**Given** I'm in settings, **When** I toggle notes generation between local and cloud, **Then** subsequent notes generation uses that model, and the active choice is always visible.

### Organize meetings into projects
**Feature:** Projects
**Given** one or more recorded meetings, **When** I create a project and assign meetings to it, **Then** I can view and filter meetings by that project and by date.

### Chat with a single meeting
**Feature:** Meeting Chatbot
**Given** a meeting with a completed transcript, **When** I ask a question in that meeting's chat, **Then** I get an answer grounded only in that meeting's transcript and notes.

### Chat across a project
**Feature:** Project Chatbot
**Given** a project with multiple meetings, **When** I ask a question in the project-level chat, **Then** I get an answer synthesized across all meetings' transcripts and notes within that project only.

## Success Metrics (KPIs)

Framework: **HEART** — this is a personal productivity tool, not a
growth-stage product, so usability/outcome metrics fit better than
acquisition-funnel metrics.

| Metric | Target | How measured |
|---|---|---|
| Task success | ≥90% of meetings produce usable notes with zero manual edits | Track whether generated notes for each meeting were accepted as-is vs. edited/discarded |
| Adoption | 100% of meetings (online + physical) captured via Scribe | Compare meetings recorded in Scribe against actual meetings held, over a month of daily use |
| Retention | Scribe remains the primary meeting-capture tool after 4 weeks | Continued weekly recording activity, no reversion to manual note-taking |
| Engagement | ≥1 chatbot query per meeting on average | Chat usage count per meeting/project over a month |

Task success ties to the "never take notes manually again" goal; adoption
and retention validate the privacy-first pitch actually replaces prior
tools; engagement confirms the chatbots deliver value beyond the notes
themselves.

## Related
