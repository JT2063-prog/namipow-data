# NamiPow snow data

Public weather snapshots for the NamiPow app (Happo-one, Hakuba47 & Goryu, Nozawa Onsen, Shiga Kogen),
refreshed every 3 hours by GitHub Actions. The app reads these when its own live calls are rate-limited.

- `forecast.json`: 10-day snow forecast per mountain (five models via Open-Meteo; MET Norway as backup)
- `depth.json`: model snow depth (top/base) and official resort snow-depth readings

Weather data: [Open-Meteo](https://open-meteo.com) (CC BY 4.0), [MET Norway](https://api.met.no) (CC BY 4.0), resort websites.
