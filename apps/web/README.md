# Web

The responsive React/Vite client. It consumes the stable REST API and contains no source-service credentials or ingestion logic.

During local development Vite serves the client at `http://127.0.0.1:5173` and
proxies `/api` requests to the local Worker at `http://127.0.0.1:8787`.
