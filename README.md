# Makers Lab

The official repository for the Accenture 1MW Maker's Lab — home to the public-facing website and Scenario Live!, an immersive client demo experience built in-house by the Maker's Lab team.

---

## What's in this repo

### `/website`
The Maker's Lab public-facing site. Covers what the lab offers, available technologies, and demo scheduling.

### `/scenario-live`
An immersive room experience where clients interact with Nova, an AI-powered holographic avatar, while the surrounding environment shifts in real time based on the conversation. Clients leave with a purple NFC keychain linking to a personalized session summary.

| Subfolder | Purpose |
|---|---|
| `looking-glass/` | Nova's holographic app — HoloPlay.js + Three.js |
| `nova/` | Claude API integration, TTS, topic detection |
| `audio/` | Sonos API control, ambient scene switching |
| `projection/` | MadMapper assets and OSC scene triggers |
| `nfc/` | NFC write logic and session summary generation |

### `/shared`
Constants, topic tags, and utilities shared across the website and Scenario Live!.

---

## Tech stack

**Frontend:** HTML, CSS, JavaScript, Three.js, HoloPlay.js  
**Backend:** Node.js, Claude API (Anthropic), ElevenLabs TTS  
**AV:** MadMapper, Sonos HTTP API, Looking Glass display  
**Hardware:** LG ProBeam + Optoma GT2000HDR projectors, Sonos Era 100s, 3D-printed NFC keychains  
**Infrastructure:** AWS (S3, CloudFront, Lambda, Route 53), GitLab CI/CD  

---

## Getting started

Clone the repo and navigate to the component you're working on:

```bash
git clone <repo-url>
cd makers-lab
```

Each subfolder has its own setup instructions. Start with the relevant folder's README.

---

## Team

| Name | Role |
|---|---|
| Talia Pannell | Project Lead |
| AlexisLabs | Co-Lead / Full Stack |
| Evie-Wong | Frontend Developer |
| emilyestudillon | Frontend Developer |
| akerah-smith | Backend Developer |
| Garrin77 | Backend Developer |
| ronald-dang | 3D Print / Hardware |
| WilsonFerreira434 | Hardware |
| JoshuaJ1717 | Hardware |

---

*Confidential — Internal Use Only — Accenture Maker's Lab, 1MW*
