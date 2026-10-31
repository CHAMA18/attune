## Inspiration

Great hospitality is made up of small decisions: what to play, what to feature, and how a room should feel as the evening unfolds. Independent operators make those decisions every day, often without a clear way to explore the tastes and places around their venue.

We built **Attune** around a question: what if an operator could use the cultural connections in their neighborhood as inspiration for a more thoughtful shift?

## What it does

Attune turns Qloo taste signals into an explorable shift plan for independent bars, cafés, and restaurants.

An operator selects a venue and can add details such as opening hours, atmosphere, budget, and an existing menu item. Attune retrieves place and artist affinities from Qloo, then uses those signals and the operator’s inputs to suggest actions for different parts of the day.

The operator can:

- Compare two directions for the room: **Quiet listening** and **Neighborhood gathering**.
- Open **“Why this?”** to inspect the available signal, affinity, and assumptions behind each action.
- Edit a shift brief and copy, share, or print it for the team.
- Record feedback on a suggestion so a future plan can offer an alternative.
- Compare related artists for two places using Qloo.

Attune treats these recommendations as ideas for an operator to evaluate. A taste affinity does not establish that customers visited a place, listened to an artist, or will make a purchase.

## How we built it

The frontend is a responsive web app built with HTML, CSS, and JavaScript. A Cloudflare Worker provides a server-side proxy for Qloo requests so the API key stays out of the browser.

Attune uses Qloo place search to resolve venue context and Qloo Insights to explore related places and artists. The interface displays returned affinities and calculates summaries from the available results. It also distinguishes recently fetched and browser-cached data.

For the shift plan, we built a structured, template-based composer. It combines available taste signals with operator-provided constraints and produces daypart suggestions with evidence and limitations. The composer runs on-device in the current interface, and the same recommendation logic is shared with the Worker.

## Challenges we ran into

The hardest challenge was translating a cultural affinity into useful operational advice without overstating what the data proves. A related artist can inspire a music direction, but an affinity score alone cannot tell us what people are playing in a venue or whether a decision will increase sales.

We also had to handle uneven location coverage. A narrow search can return an anchor place but no related places. Attune now treats that as an empty result, preserves the information Qloo did return, and suggests widening the search rather than presenting it as a connection failure.

Finally, we worked through the details of making the experience usable across desktop and mobile: venue selection, cached data, evidence states, navigation, and a clear distinction between Qloo signals and locally bundled audio previews.

## Accomplishments that we're proud of

We’re proud that Attune makes a complex taste graph approachable for someone running a real room. The experience moves from a venue and its surrounding signals to a plan that can be reviewed and adapted by an operator.

We’re especially proud of the evidence panels. They make the source of a suggestion visible and acknowledge when an action is a general prompt rather than a direct Qloo signal.

We also built a complete product journey around the idea: a landing page, responsive app, venue comparison, editable team brief, and feedback controls.

## What we learned

We learned that **explainability is part of the experience**, not just a technical feature. Operators need to know why a suggestion appeared and whether it fits their venue.

We also learned to distinguish carefully between **data, calculations, and decisions**. Qloo provides cultural affinity signals; Attune calculates some summaries and proposes actions; the operator decides what to use.

## What's next for Attune

Our next priority is to test Attune with independent hospitality operators and learn which recommendations are specific and practical enough to use during a real shift.

From there, we want to improve the planning experience with richer venue constraints, more useful alternatives based on operator feedback, and a clearer way to evaluate suggestions after service. We also want to continue improving location resolution and data coverage while keeping the source and limits of every recommendation visible.
