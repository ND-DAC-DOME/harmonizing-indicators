# Private Sector Engagement — Harmonizing Indicators

Static site that maps U.S. Standard Foreign Assistance Indicators to business-relevant reporting indicators (GRI, SASB, IRIS+, BCtA). Served from GitHub Pages with no server or database.

Live data lives in [`docs/data/indicators.json`](docs/data/indicators.json). Edit that file to update the site; commit and push to deploy.

## Local preview

GitHub Pages (and browsers) need HTTP for `fetch`, so open via a local server:

```bash
python3 -m http.server -d docs
```

Then visit http://localhost:8000/

## Updating the data

1. Edit [`docs/data/indicators.json`](docs/data/indicators.json) by hand, **or** regenerate from the Excel source:

   ```bash
   pip install openpyxl
   python3 scripts/xlsx_to_json.py
   ```

   The converter reads [`data/HI_Source_Document_100621_1_pn5VMxa.xlsx`](data/HI_Source_Document_100621_1_pn5VMxa.xlsx) (sheet 1, header row 1) and overwrites `docs/data/indicators.json`.

2. Preview locally, then commit and push. Pages updates automatically from the `/docs` folder on the default branch.

### Indicator record shape

```json
{
  "spsd_category_code": "EG",
  "spsd_category": "Economic Growth",
  "program_area": "Agriculture",
  "fa_indicator_code": "EG.3-10",
  "fa_indicator": "Yield of targeted ...",
  "engagement_objective": "Agricultural Production and Revenue",
  "business_code": "BCtA 2.3.a",
  "business_indicator": "# of individuals ...",
  "source": "BCtA",
  "source_reference": null,
  "sdg_goal": 2,
  "sdg_goal_title": "End hunger, ...",
  "sdg_target_number": "2.4",
  "sdg_target": "Ensure sustainable ..."
}
```

When `source_reference` is `null`, the UI falls back to `default_source_links[source]` in the same JSON file.

## GitHub Pages setup

1. Repo **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: your default branch, folder **`/docs`**
4. (Optional custom domain) keep [`docs/CNAME`](docs/CNAME) as `harmonizing-indicators.crc.nd.edu`, and point a DNS CNAME for `harmonizing-indicators` under `crc.nd.edu` at `nd-dac-dome.github.io`. Enable **Enforce HTTPS** after DNS propagates.

## History

This static site replaces a Django + Postgres application previously hosted under `crcresearch/harmonizing_indicators`.
