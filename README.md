# mikva

Code repository for **mikva**.

## Directory guide

- `client` — client code.
- `server` — server code.
- `mobile` — mobile app.
- `AndroidMikva` — mobile app.

## Commands from package.json

- `npm run dev`: `concurrently "npm --prefix server run dev" "npm --prefix client run dev"`
- `npm run install:all`: `npm install && npm install --prefix client && npm install --prefix server`
- `npm run build`: `npm run build --prefix client`
