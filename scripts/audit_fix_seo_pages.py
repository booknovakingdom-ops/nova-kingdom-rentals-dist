#!/usr/bin/env python3
"""Audit and fix the expanded SEO pages.

Actions:
- Remove 3 pages with clear factual/risk issues
- Improve content uniqueness and NB/CB disclaimers
- Enrich water-slide and lawn-game pages that were thinnest
- Write back seoPages.json and update sitemap.xml
"""
from __future__ import annotations
import json, re, xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE_URL = "https://novakingdomrentals.com"

pages = json.load((ROOT / "data/seoPages.json").read_text.__func__(ROOT / "data/seoPages.json", encoding="utf-8") and open(ROOT / "data/seoPages.json"))

EXISTING_SLUGS = {
    "bouncy-castle-rentals-bridgewater-ns","inflatable-rentals-south-shore-ns",
    "party-rentals-chester-ns","bouncy-castle-rentals-lunenburg-ns",
    "inflatable-rentals-mahone-bay-ns","party-rentals-liverpool-ns",
    "bouncy-castle-rentals-shelburne-ns","inflatable-rentals-yarmouth-ns",
    "party-rentals-digby-ns","inflatable-rentals-kentville-ns",
    "water-slide-rentals-nova-scotia","school-event-inflatable-rentals-nova-scotia",
    "community-event-rentals-nova-scotia","lawn-game-rentals-nova-scotia",
    "inflatable-rentals-halifax-ns","bouncy-castle-rentals-dartmouth-ns",
    "inflatable-rentals-truro-ns","bouncy-castle-rentals-sydney-ns",
    "inflatable-rentals-atlantic-canada","event-rentals-atlantic-canada",
    "school-event-rentals-atlantic-canada","festival-inflatable-rentals-atlantic-canada",
    "360-video-booth-rental-nova-scotia","photo-booth-rental-bridgewater-ns",
    "360-video-booth-rental-new-brunswick","360-video-booth-rental-pei",
    "photo-booth-rental-halifax-ns","photo-booth-rental-moncton-nb",
    "photo-booth-rental-charlottetown-pei","photo-booth-rentals-maritimes",
    "event-photo-booth-rental-atlantic-canada","bouncy-castle-space-guide",
    "wet-vs-dry-inflatable-guide","birthday-party-inflatable-guide",
    "school-event-inflatable-guide","festival-inflatable-planning-guide",
    "community-event-inflatable-guide","360-video-booth-event-ideas",
    "how-to-book-inflatable-rental"
}

# ---------------------------------------------------------------------------
# Pages to remove
# ---------------------------------------------------------------------------
REMOVE = {
    "inflatable-rentals-amherst-area-nb",   # factual error — Amherst is Nova Scotia
    "inflatable-rentals-saint-john-nb",      # 350 km, not a realistic service area
    "party-rentals-saint-john-nb",           # same
}
print(f"Removing {len(REMOVE)} pages: {', '.join(sorted(REMOVE))}")

# ---------------------------------------------------------------------------
# Per-city context snippets for intro differentiation
# ---------------------------------------------------------------------------
CITY_CONTEXT = {
    "Windsor NS":         "Windsor is known as the birthplace of hockey and hosts community events and family celebrations throughout the year.",
    "Wolfville NS":       "Wolfville is home to Acadia University and a vibrant arts and community scene, with events ranging from campus celebrations to family gatherings.",
    "Annapolis Royal NS": "Annapolis Royal is one of Nova Scotia's oldest communities, with festivals, heritage events, and family celebrations through the warmer months.",
    "Middleton NS":       "Middleton sits in the heart of the Annapolis Valley and serves as a hub for surrounding rural communities.",
    "Bridgetown NS":      "Bridgetown is a small Annapolis Valley town with a tight-knit community and strong tradition of backyard and neighbourhood events.",
    "Bedford NS":         "Bedford is one of the fastest-growing communities in HRM, with a strong mix of family neighbourhoods, school events, and corporate functions.",
    "Lower Sackville NS": "Lower Sackville is a busy suburban community within HRM, popular for backyard birthdays and neighbourhood events.",
    "Cole Harbour NS":    "Cole Harbour is a family-centred community within HRM, known for its sports heritage and active neighbourhood culture.",
    "Fall River NS":      "Fall River is a growing residential community within HRM, with a mix of backyard events, school fun days, and local celebrations.",
    "New Glasgow NS":     "New Glasgow is the commercial heart of Pictou County, with a strong school, festival, and community event calendar.",
    "Stellarton NS":      "Stellarton is a small community in Pictou County, neighbour to New Glasgow, with close-knit family and community events.",
    "Pictou NS":          "Pictou is a historic harbour town and the 'Birthplace of New Scotland,' with summer festivals, heritage events, and family gatherings.",
    "Antigonish NS":      "Antigonish is home to St. Francis Xavier University and the famous Highland Games festival — a year-round hub for school events and community celebrations.",
    "Amherst NS":         "Amherst sits on the NS/NB border and serves as a gateway for events across northern Nova Scotia and into New Brunswick.",
    "Port Hawkesbury NS": "Port Hawkesbury is Cape Breton's main commercial hub on the Strait of Canso, serving a wide regional area for larger events and festivals.",
    "Baddeck NS":         "Baddeck is a scenic Cape Breton village on the Bras d'Or Lake, known for summer tourism, weddings, and community events.",
    "North Sydney NS":    "North Sydney is an active Cape Breton community with a ferry terminal and regular school, community, and waterfront events.",
    "Glace Bay NS":       "Glace Bay is a Cape Breton community with a rich mining heritage and active community event and school fun day culture.",
    "New Waterford NS":   "New Waterford is a Cape Breton residential community with strong neighbourhood traditions and school and family event activity.",
    "Inverness NS":       "Inverness is a Cape Breton coastal town known for its beach and golf, with summer family events and community gatherings.",
    "Sackville NB":       "Sackville is a university town on the NS/NB border, home to Mount Allison University and a range of community and campus events.",
    "Moncton NB":         "Moncton is Atlantic Canada's fastest-growing city and a major event hub, with weddings, festivals, corporate events, and school celebrations year-round.",
    "Fredericton NB":     "Fredericton is New Brunswick's capital and home to two universities, with a strong calendar of community, campus, and corporate events.",
    "Sussex NB":          "Sussex is a small agricultural community in New Brunswick's Kennebecasis Valley, with active community events and family celebrations.",
    # water slide / lawn game specific
    "South Shore NS":     "The South Shore of Nova Scotia is a top summer destination, making outdoor inflatable and lawn game rentals especially popular during the warmer months.",
    "Truro NS":           "Truro is a central Nova Scotia hub with strong school, community, and agricultural event activity throughout the year.",
    "Dartmouth NS":       "Dartmouth is a major HRM city with an active community events and backyard party scene.",
    "Halifax NS":         "Halifax is Nova Scotia's capital and largest city, with year-round events from corporate functions to backyard birthday parties.",
    "Lunenburg NS":       "Lunenburg is a UNESCO World Heritage town on the South Shore, popular for summer celebrations, festivals, and family events.",
    "Kentville NS":       "Kentville is the main commercial centre of the Annapolis Valley, serving a wide area of families, schools, and community organizations.",
}

NB_DISCLAIMER = (
    "Nova Kingdom Rentals is based in Bridgewater, Nova Scotia. "
    "New Brunswick bookings are available for selected larger events and special occasions — "
    "routine backyard rentals are not available in NB. "
    "Contact us to confirm availability, travel cost, and event suitability before planning."
)

CB_DISCLAIMER = (
    "Nova Kingdom Rentals is based in Bridgewater, Nova Scotia. "
    "Cape Breton bookings are available for selected larger events and special occasions — "
    "not routine backyard rentals. "
    "Travel cost, availability, and event suitability are all confirmed by quote before booking."
)

CB_SLUGS = {'bouncy-castle-rentals-port-hawkesbury-ns','bouncy-castle-rentals-baddeck-ns',
            'bouncy-castle-rentals-north-sydney-ns','bouncy-castle-rentals-glace-bay-ns',
            'bouncy-castle-rentals-new-waterford-ns','bouncy-castle-rentals-inverness-ns',
            'party-rentals-glace-bay-ns','party-rentals-north-sydney-ns',
            'party-rentals-port-hawkesbury-ns','party-rentals-inverness-ns',
            'party-rentals-baddeck-ns','photo-booth-rental-sydney-ns'}

NB_SLUGS = {'inflatable-rentals-sackville-nb','inflatable-rentals-moncton-nb',
            'inflatable-rentals-fredericton-nb','inflatable-rentals-sussex-nb',
            'photo-booth-rental-fredericton-nb','kids-foam-party-moncton-nb',
            'party-rentals-moncton-nb','party-rentals-fredericton-nb',
            'party-rentals-sackville-nb','party-rentals-sussex-nb'}

IMPROVED = []

def city_label(slug: str) -> str:
    """Extract a city label for lookup."""
    # Map slugs to city names
    SLUG_CITY = {
        'windsor-ns': 'Windsor NS', 'wolfville-ns': 'Wolfville NS',
        'annapolis-royal-ns': 'Annapolis Royal NS', 'middleton-ns': 'Middleton NS',
        'bridgetown-ns': 'Bridgetown NS', 'bedford-ns': 'Bedford NS',
        'lower-sackville-ns': 'Lower Sackville NS', 'cole-harbour-ns': 'Cole Harbour NS',
        'fall-river-ns': 'Fall River NS', 'new-glasgow-ns': 'New Glasgow NS',
        'stellarton-ns': 'Stellarton NS', 'pictou-ns': 'Pictou NS',
        'antigonish-ns': 'Antigonish NS', 'amherst-ns': 'Amherst NS',
        'port-hawkesbury-ns': 'Port Hawkesbury NS', 'baddeck-ns': 'Baddeck NS',
        'north-sydney-ns': 'North Sydney NS', 'glace-bay-ns': 'Glace Bay NS',
        'new-waterford-ns': 'New Waterford NS', 'inverness-ns': 'Inverness NS',
        'sackville-nb': 'Sackville NB', 'moncton-nb': 'Moncton NB',
        'fredericton-nb': 'Fredericton NB', 'sussex-nb': 'Sussex NB',
        'south-shore-ns': 'South Shore NS', 'truro-ns': 'Truro NS',
        'dartmouth-ns': 'Dartmouth NS', 'halifax-ns': 'Halifax NS',
        'lunenburg-ns': 'Lunenburg NS', 'kentville-ns': 'Kentville NS',
        'yarmouth-ns': 'Yarmouth NS', 'sydney-ns': 'Sydney NS', 'bridgewater-ns': 'Bridgewater NS',
    }
    for suffix, city in SLUG_CITY.items():
        if slug.endswith(suffix):
            return city
    return ""

def improve_page(p: dict) -> dict:
    slug = p['slug']
    if slug in EXISTING_SLUGS:
        return p

    changed = False
    city = city_label(slug)
    context = CITY_CONTEXT.get(city, "")

    # Fix NB disclaimer
    if slug in NB_SLUGS and NB_DISCLAIMER not in p.get('serviceAreaText', ''):
        p['serviceAreaText'] = NB_DISCLAIMER
        changed = True

    # Fix CB disclaimer
    if slug in CB_SLUGS and CB_DISCLAIMER not in p.get('serviceAreaText', ''):
        p['serviceAreaText'] = CB_DISCLAIMER
        changed = True

    # Enrich intro with city context
    if context and context not in p.get('intro', ''):
        p['intro'] = p['intro'].rstrip('.') + ' ' + context
        changed = True

    # Fix NB pages: make intros clearer about "selected events"
    if slug in NB_SLUGS:
        intro = p['intro']
        if 'selected larger events' not in intro and 'selected bookings' not in intro:
            intro = intro.replace(
                'Nova Kingdom Rentals brings',
                'Nova Kingdom Rentals serves selected larger events in'
            ).replace(
                'Nova Kingdom Rentals provides',
                'Nova Kingdom Rentals serves selected larger events in'
            ).replace(
                ' — inflatables, water slides',
                ' with inflatables, water slides'
            )
            # Simpler fix: append caveat
            p['intro'] = p['intro'] + ' Available for selected larger events and special occasions — contact us to confirm before planning.'
            changed = True

    # Fix CB pages: make intros clearer
    if slug in CB_SLUGS:
        if 'selected larger events' not in p.get('intro', '') and 'by quote' not in p.get('intro', ''):
            p['intro'] = p['intro'] + ' Available for selected larger Cape Breton events and special occasions — contact us to confirm availability and travel cost before planning.'
            changed = True

    # Improve water slide pages with extra FAQ
    if slug.startswith('water-slide-rentals-') and slug not in EXISTING_SLUGS:
        existing_qs = {f['question'] for f in p.get('faq', [])}
        extra = {
            "question": "How old do kids need to be to use a water slide?",
            "answer": "Age and height suitability depends on the specific unit. The Crown Island Combo splash pool is suitable for younger children. The Crown Rush 42 is better suited to older kids and teens. We will confirm age/height guidance when you request your rental."
        }
        if extra['question'] not in existing_qs:
            p['faq'].append(extra)
            changed = True

    # Improve lawn game pages with extra FAQ
    if slug.startswith('lawn-game-rentals-') and slug not in EXISTING_SLUGS:
        existing_qs = {f['question'] for f in p.get('faq', [])}
        extra = {
            "question": "What lawn games are most popular for birthdays and community events?",
            "answer": "Cornhole, Giant Jenga, and Giant Connect 4 are consistently the most popular choices. Bocce Ball, Spikeball, Ladder Toss, and Badminton work great for events with older guests or more space."
        }
        if extra['question'] not in existing_qs:
            p['faq'].append(extra)
            changed = True

    # Strengthen foam pages — confirm no adult language, ensure kids-only language is prominent
    if slug.startswith('kids-foam-party-') and slug not in EXISTING_SLUGS:
        intro = p.get('intro', '')
        if 'not available for adult events' not in intro and 'children' not in intro.lower():
            p['intro'] = p['intro'] + ' For children only — not available for adult-only events or events where alcohol is being served.'
            changed = True

    # Fix duplicate "Selected bookings" sentence in serviceAreaText (can happen from double-append)
    if 'serviceAreaText' in p:
        # Remove accidental duplicates
        text = p['serviceAreaText']
        if text.count('Selected') > 2:
            # Clean up
            sentences = text.split('. ')
            seen_s = []
            for s in sentences:
                if s not in seen_s:
                    seen_s.append(s)
            p['serviceAreaText'] = '. '.join(seen_s)
            changed = True

    if changed:
        IMPROVED.append(slug)
    return p

# ---------------------------------------------------------------------------
# Apply fixes
# ---------------------------------------------------------------------------
cleaned = []
for p in pages:
    if p['slug'] in REMOVE:
        print(f"  REMOVED: {p['slug']}")
        continue
    cleaned.append(improve_page(p))

print(f"\nImproved {len(IMPROVED)} pages")
print(f"Final page count: {len(cleaned)} (was {len(pages)})")

# Write back
(ROOT / "data/seoPages.json").write_text(
    json.dumps(cleaned, ensure_ascii=False, indent=2),
    encoding="utf-8"
)
print("Updated data/seoPages.json")

# ---------------------------------------------------------------------------
# Update sitemap.xml — remove deleted slugs
# ---------------------------------------------------------------------------
sitemap_path = ROOT / "sitemap.xml"
NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
ET.register_namespace("", NS)
tree = ET.parse(sitemap_path)
root = tree.getroot()

removed_urls = {f"{BASE_URL}/{slug}" for slug in REMOVE}
to_delete = []
for url_el in root.findall(f"{{{NS}}}url"):
    loc = url_el.find(f"{{{NS}}}loc")
    if loc is not None and loc.text in removed_urls:
        to_delete.append(url_el)

for el in to_delete:
    root.remove(el)
    print(f"  Removed from sitemap: {el.find(f'{{{NS}}}loc').text}")

remaining = len(root.findall(f"{{{NS}}}url"))
ET.indent(tree, space="  ")
tree.write(sitemap_path, encoding="unicode", xml_declaration=True)
content = sitemap_path.read_text(encoding="utf-8")
sitemap_path.write_text(
    '<?xml version="1.0" encoding="UTF-8"?>\n' + content.split('\n', 1)[1],
    encoding="utf-8"
)
print(f"Updated sitemap.xml — {remaining} URLs remaining")
