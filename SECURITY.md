# Security Notes

PQFMS handles synthetic patient information for an academic demonstration. It must not be used with real patient records without a separate clinical, legal, information-security and privacy assessment.

## Credentials

Never commit `.env` files. Use `.env.example` as the public configuration template. Demo credentials are synthetic and must not be reused outside the assessment environment.

## Authentication and authorisation

Staff authentication uses bcrypt password hashes and signed JWT access tokens. Every protected request checks both token validity and the account's current active state. Role and permission checks occur on the server.

## Public interfaces

The kiosk and Display Board use public endpoints intentionally. Public responses are minimised so they do not disclose identification numbers, full names, symptoms or consultation notes.

## Transport

The assessment configuration runs on localhost. Production deployment would require TLS termination, production application servers, managed secrets and infrastructure hardening.

## Incident response for the academic environment

If a credential is exposed, rotate it immediately, remove it from source control, invalidate the affected account/secret and recreate the local environment from `.env.example`.
