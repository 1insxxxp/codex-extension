# Access Token Display Design

Date: 2026-05-22

Goal: Show the ChatGPT session access token in plaintext for debugging.

Design: Read accessToken from common session response keys, surface it in the details UI, and include it in the generated auth.json instead of the current redacted placeholder. If no token is returned, display 未返回 and keep JSON token empty/placeholder-safe.

Safety note: This intentionally displays a sensitive credential in plaintext because the user requested direct debugging visibility.
