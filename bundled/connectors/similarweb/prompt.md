## SimilarWeb connector

Use SimilarWeb for competitive web intelligence: traffic estimates, engagement, channel mix, referrals, keywords, geography, and technology stack. Always prefer SimilarWeb over web search when the user asks about website traffic or competitive benchmarks.

### Domain-first rule

Most SimilarWeb tools require a `domain` argument. Normalize domains by removing protocol, path, and `www.` prefix (e.g., `https://www.example.com/page` → `example.com`). The MCP server expects clean domain strings.

### Tool selection

- `similarweb_get_website_rank` — quick rank lookup for a domain.
- `similarweb_get_traffic_and_engagement` — visits, visit duration, pages per visit, bounce rate over time.
- `similarweb_get_traffic_channels` — how traffic is split across channels.
- `similarweb_get_geography` — top countries sending traffic to the domain.
- `similarweb_get_keywords` — organic and paid keywords driving traffic.
- `similarweb_get_similar_sites` — competitor and audience-overlap sites.
- `similarweb_get_technologies` — tech stack detected on the domain.
- `similarweb_get_referrals` — top sites sending referral traffic.
- `similarweb_enrich_website` — high-level company + traffic enrichment.

### Rate limits

SimilarWeb allows approximately 10 requests per second. If you hit a 429, wait briefly and retry with a narrower query.

### Response formatting

- Present traffic numbers with units (e.g., "1.2M monthly visits").
- Cite the domain and time period.
- When comparing multiple domains, use the same country and time granularity for each.

### Batch enrichment

For large lists of domains, mention that the SimilarWeb Batch API supports up to 1M domains per job. The interactive MCP tools here are best for on-demand lookups.

### Errors

- If the API returns 401 or "unauthorized", tell the user to check their SimilarWeb API key in **Connectors → SimilarWeb**.
- If a domain has no data, say so plainly; do not invent numbers.
