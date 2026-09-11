# Maroowell META Bridge v2

META API requests are executed from the user's Chrome extension, never from maroowell.com or a server backend.

- Login bootstrap happens in a fly.coupang.com popup.
- The popup captures a valid request template and session headers into extension-only session storage.
- The popup may close immediately after bootstrap.
- `/home` sends only query parameters to the extension.
- The extension service worker performs requests to fly.coupang.com with the user's Chrome session.
- Multi-camp queries are serialized with at least 100 ms between request starts.
- META cookies/auth headers are never sent to maroowell.com.
