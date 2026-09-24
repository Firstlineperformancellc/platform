#!/usr/bin/env python3
"""Generates the static marketing pages in site/www from one shared frame.
Edit the copy here, run `python3 site/build.py`, commit the generated HTML.
Only site/www is deployed; site/index.html (the coming-soon page) is untouched."""
import os, pathlib

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / "www"
env_path = ROOT.parent / "apps" / "product" / ".env"
ANON = ""
for line in env_path.read_text().splitlines():
    if line.startswith("EXPO_PUBLIC_SUPABASE_ANON_KEY="):
        ANON = line.split("=", 1)[1].strip()

NAV = [("index.html", "Home"), ("how-it-works.html", "How it works"), ("for-mentors.html", "For mentors"), ("pricing.html", "Pricing"), ("faq.html", "FAQ")]

def frame(title, desc, body, current):
    links = []
    for href, label in NAV:
        cur = ' aria-current="page"' if href == current else ""
        links.append(f'<a href="{href}"{cur}>{label}</a>')
    nav = "".join(links)
    return f'''<!doctype html>
<html lang="en" data-anon="{ANON}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} · First Line Performance</title>
<meta name="description" content="{desc}">
<meta property="og:title" content="{title} · First Line Performance">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="https://firstlineperform.com/logo.png">
<link rel="icon" href="assets/logo.png" type="image/png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@1,700;1,800&family=Barlow:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/site.css">
</head>
<body>
<header class="top">
  <div class="wrap">
    <a class="brand" href="index.html"><img src="assets/logo.png" alt="" width="44" height="45"><span>First Line Performance</span></a>
    <button class="menu" aria-label="Menu">Menu</button>
    <nav class="nav">{nav}<a class="cta" data-app="/sign-in" href="#">Sign in</a></nav>
  </div>
</header>
<main>
{body}
</main>
<footer>
  <div class="wrap">
    <div>
      <a class="brand" href="index.html" style="margin-bottom:10px"><img src="assets/logo.png" alt="" width="44" height="45"><span>First Line Performance</span></a>
      <p class="small">Personalized video breakdowns and live Film Room mentoring from athletes who played at the level your youth athlete is chasing.</p>
    </div>
    <div><h4>Product</h4><a href="how-it-works.html">How it works</a><a href="pricing.html">Pricing</a><a href="faq.html">FAQ</a><a data-app="/mentors" href="#">Browse FLP Mentors</a></div>
    <div><h4>Mentors</h4><a href="for-mentors.html">Become an FLP Mentor</a><a data-app="/apply" href="#">Apply</a></div>
    <div><h4>Company</h4><a href="contact.html">Contact</a><a href="privacy.html">Privacy</a><a href="terms.html">Terms</a></div>
    <div class="copy">&copy; 2026 First Line Performance LLC. All rights reserved.</div>
  </div>
</footer>
<script src="assets/site.js"></script>
</body>
</html>
'''

PAGES = {}

PAGES["index.html"] = ("Film breakdowns from athletes who've done it", "Upload your youth athlete's game film. An FLP Mentor who played NCAA, PWHL or pro breaks it down on video, with a Player Development Worksheet, within 72 hours.", '''
<section class="hero">
  <div class="wrap">
    <div>
      <p class="kicker">Real insight. Real athletes. Real development.</p>
      <h1>Game film, broken down by <span class="gold">someone who's played it</span></h1>
      <div class="rule"></div>
      <p class="lead">Upload the game. Pick an FLP Mentor who played at the level your youth athlete is chasing. Get a recorded breakdown and a Player Development Worksheet back within <span data-rule="turnaround_hours">72</span> hours.</p>
      <div class="btns">
        <a class="btn primary" data-app="/mentors" href="#">Browse FLP Mentors</a>
        <a class="btn secondary" href="how-it-works.html">How it works</a>
      </div>
    </div>
    <img class="logo" src="assets/logo.png" alt="First Line Performance" width="800" height="810">
  </div>
</section>

<section class="band">
  <div class="wrap">
    <div class="grid cols3">
      <div class="card"><div class="n">1</div><h3>Pick your mentor</h3><p class="muted">Every FLP Mentor is listed by position, the highest level they played, their turnaround, and what other parents said. You choose. Nobody is assigned to you.</p></div>
      <div class="card"><div class="n">2</div><h3>Upload the film</h3><p class="muted">Full games are fine. The upload resumes on its own if your connection drops, and only your mentor can see it.</p></div>
      <div class="card"><div class="n">3</div><h3>Get the breakdown</h3><p class="muted">A recorded video walkthrough plus a written Player Development Worksheet: strengths, what to fix, the clips that show it, drills, and next steps. It lives in your youth athlete's Development Log.</p></div>
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <p class="kicker">Then go live</p>
    <h2>The Film Room</h2>
    <p class="lead">A 30 or 60 minute video session where the mentor pulls up the film and walks your youth athlete through it, live. Every session is recorded, booked through the parent account, and followed by a written recap.</p>
    <div class="checks">
      <div>Book inside the mentor's posted availability</div>
      <div>Parents can sit in on any session</div>
      <div>Recorded, always. There is no off-the-record option</div>
      <div>Recap with takeaways, drills and one next step within 24 hours</div>
    </div>
    <div class="btns" style="margin-top:26px"><a class="btn secondary" href="pricing.html">See pricing</a></div>
  </div>
</section>

<section class="band">
  <div class="wrap">
    <p class="kicker">Built for families</p>
    <h2>Parents own the account. <span class="gold">Full stop.</span></h2>
    <div class="grid cols3">
      <div class="card"><h3>No kid logins</h3><p class="muted">Your youth athlete is a profile under your account, never a login. There is no direct messaging between mentors and minors.</p></div>
      <div class="card"><h3>Quality Control Audit</h3><p class="muted">Not what you expected? File an audit within <span data-rule="qca_window_days">7</span> days. FLP watches the breakdown, reads the worksheet, and decides on a refund, a re-review or a fix.</p></div>
      <div class="card"><h3>Money handled by Stripe</h3><p class="muted">You're charged at checkout through Stripe. FLP never holds your card details, and mentors are paid through Stripe too.</p></div>
    </div>
  </div>
</section>

<section>
  <div class="wrap" style="text-align:center">
    <h2>Ready when the film is</h2>
    <p class="lead" style="margin:0 auto 24px">Create a parent account, add your youth athlete, pick a mentor.</p>
    <div class="btns" style="justify-content:center"><a class="btn primary" data-app="/sign-up" href="#">Create a parent account</a><a class="btn secondary" href="for-mentors.html">I'm an athlete who wants to mentor</a></div>
  </div>
</section>
''')

PAGES["how-it-works.html"] = ("How it works", "From upload to breakdown to the live Film Room: what happens, when, and what you get back.", '''
<section class="hero" style="padding-bottom:24px">
  <div class="wrap" style="grid-template-columns:1fr">
    <div>
      <p class="kicker">How it works</p>
      <h1>Four steps to a <span class="gold">better next game</span></h1>
      <div class="rule"></div>
      <p class="lead">A breakdown is a recorded, position-specific review of one game by an athlete who has played at a higher level than your youth athlete plays today.</p>
    </div>
  </div>
</section>
<section class="tight">
  <div class="wrap">
    <div class="steps">
      <div class="step"><h3>Add your youth athlete</h3><p class="muted">Name, age group, position and level. You do it once. Every breakdown and Film Room is filed under them from then on.</p></div>
      <div class="step"><h3>Choose an FLP Mentor</h3><p class="muted">Filter by position. See the level they played, their current team, average turnaround and parent reviews. Name a second choice in case your first is at capacity.</p></div>
      <div class="step"><h3>Pay, then upload</h3><p class="muted">You pay at checkout. Then upload the game (any length) or paste a YouTube link, and tell the mentor what to look for.</p></div>
      <div class="step"><h3>Watch the breakdown</h3><p class="muted">Your mentor accepts within <span data-rule="accept_hours">48</span> hours and delivers within <span data-rule="turnaround_hours">72</span> hours of accepting: a recorded walkthrough and the Player Development Worksheet.</p></div>
    </div>
  </div>
</section>
<section class="band">
  <div class="wrap">
    <div class="grid cols2">
      <div>
        <p class="kicker">What you get back</p>
        <h2>The Player Development Worksheet</h2>
        <p class="muted">Every breakdown ships with a written worksheet, delivered as a PDF you keep:</p>
        <ul class="muted" style="padding-left:18px">
          <li>Strengths: what they did well, with the moments that show it</li>
          <li>Areas to improve, in plain language</li>
          <li>Game situations from the film, clip by clip: what happened, what to change, the takeaway</li>
          <li>Recommended workouts and drills, with how often to do them</li>
          <li>Next steps: the action plan for the next few weeks</li>
        </ul>
      </div>
      <div>
        <p class="kicker">Over time</p>
        <h2>The Development Log</h2>
        <p class="muted">Every breakdown and every Film Room recap lands in your youth athlete's Development Log, oldest first, so you, the next coach, or a recruiter can read the arc from the first game on.</p>
        <p class="muted">Rate every breakdown. Ratings of <span data-rule="review_auto_publish_min">3</span> stars and up appear on the mentor's profile right away. Lower ratings go to FLP first.</p>
      </div>
    </div>
  </div>
</section>
<section>
  <div class="wrap">
    <p class="kicker">Live</p>
    <h2>The Film Room</h2>
    <p class="lead">Book a live session from any mentor's profile, inside the hours they've posted.</p>
    <div class="grid cols3">
      <div class="card"><h3>30 or 60 minutes</h3><p class="muted">The mentor shares the film and walks your youth athlete through it. Ask anything. Parents may sit in.</p></div>
      <div class="card"><h3>After a breakdown</h3><p class="muted">Within <span data-rule="addon_window_days">14</span> days of a delivered breakdown, book a 30 minute add-on with the same mentor at a lower price to go through it live.</p></div>
      <div class="card"><h3>Season Arc</h3><p class="muted"><span data-rule="season_arc_sessions">4</span> sessions with one mentor over <span data-rule="season_arc_weeks">8</span> weeks. Same mentor, same youth athlete, one thread of development.</p></div>
    </div>
    <p class="note" style="margin-top:22px">Every Film Room is recorded from the moment the mentor joins, with no way for anyone in the room to turn it off. Recordings are kept by FLP for quality control and safeguarding.</p>
  </div>
</section>
''')

PAGES["for-mentors.html"] = ("Become an FLP Mentor", "Played NCAA, PWHL or pro? Get paid to break down youth hockey film on your own schedule.", '''
<section class="hero" style="padding-bottom:24px">
  <div class="wrap" style="grid-template-columns:1fr">
    <div>
      <p class="kicker">For athletes</p>
      <h1>You've played it. <span class="gold">Teach it.</span></h1>
      <div class="rule"></div>
      <p class="lead">FLP Mentors are current and former NCAA, PWHL and professional players who break down youth game film and run live Film Rooms. You set how much you take on and when you're available.</p>
      <div class="btns"><a class="btn primary" data-app="/apply" href="#">Apply to mentor</a></div>
    </div>
  </div>
</section>
<section class="tight">
  <div class="wrap">
    <div class="grid cols3">
      <div class="card"><h3>Your tier is your level</h3><p class="muted">Tiers follow the highest level you played: Pro (NHL, AHL, ECHL, European pro), PWHL, and NCAA. Parents pay by tier, and you keep the majority of every dollar. The exact split is shown when you apply.</p></div>
      <div class="card"><h3>Your schedule</h3><p class="muted">Set how many breakdowns you'll hold at once (up to <span data-rule="capacity_max">5</span>) and the weekly windows when parents can book a Film Room. When you're full, the marketplace says so.</p></div>
      <div class="card"><h3>Your tools</h3><p class="muted">Watch the film in the browser or download it, record the breakdown with whatever you already use, fill in the worksheet, deliver. FLP turns the worksheet into a branded PDF.</p></div>
    </div>
  </div>
</section>
<section class="band">
  <div class="wrap">
    <div class="grid cols2">
      <div>
        <p class="kicker">The job</p>
        <h2>What a breakdown involves</h2>
        <ul class="muted" style="padding-left:18px">
          <li>Accept a request within <span data-rule="accept_hours">48</span> hours, or it moves to the family's second choice</li>
          <li>Deliver within <span data-rule="turnaround_hours">72</span> hours of accepting</li>
          <li>A recorded video walkthrough plus the Player Development Worksheet: at least one clip and one drill</li>
          <li>Ratings from parents build your profile; your on-time rate and turnaround are shown to families</li>
        </ul>
      </div>
      <div>
        <p class="kicker">Getting paid</p>
        <h2>Stripe, after delivery</h2>
        <p class="muted">Connect a bank account through Stripe once. Each delivered breakdown and completed Film Room adds your share to your ledger, and FLP pays it out through Stripe. FLP never touches your bank details.</p>
        <p class="muted">Payouts on a breakdown pause only while a Quality Control Audit is open on it.</p>
      </div>
    </div>
  </div>
</section>
<section>
  <div class="wrap">
    <p class="kicker">Ground rules</p>
    <h2>Safeguarding is not optional</h2>
    <div class="checks">
      <div>All contact with families runs through the platform</div>
      <div>No direct messaging with youth athletes</div>
      <div>Every Film Room is recorded and kept by FLP</div>
      <div>Parents can join any session at any time</div>
      <div>Two no-shows or repeated late cancellations end the relationship</div>
      <div>FLP verifies playing history before the Verified badge appears</div>
    </div>
    <div class="btns" style="margin-top:28px"><a class="btn primary" data-app="/apply" href="#">Apply to mentor</a><a class="btn secondary" href="faq.html#mentors">Mentor FAQ</a></div>
  </div>
</section>
''')

PAGES["pricing.html"] = ("Pricing", "One flat price per breakdown by mentor tier. Film Room sessions priced by length and tier. No subscriptions.", '''
<section class="hero" style="padding-bottom:24px">
  <div class="wrap" style="grid-template-columns:1fr">
    <div>
      <p class="kicker">Pricing</p>
      <h1>One game. <span class="gold">One price.</span></h1>
      <div class="rule"></div>
      <p class="lead">You pay per breakdown, by the tier of the mentor you choose. No subscription, no bundles you don't need. Charged at checkout through Stripe.</p>
    </div>
  </div>
</section>
<section class="tight">
  <div class="wrap">
    <div class="tiers">
      <div class="tier"><h3>NCAA</h3><p class="who">Played NCAA Division 1 or 3, or U Sports</p><div class="price"><span data-price="breakdown.ncaa">$175</span><small>per game</small></div><ul><li>Recorded breakdown</li><li>Player Development Worksheet PDF</li><li><span data-rule="turnaround_hours">72</span> hour turnaround from acceptance</li></ul></div>
      <div class="tier"><h3>PWHL</h3><p class="who">Played in the Professional Women's Hockey League</p><div class="price"><span data-price="breakdown.pwhl">$250</span><small>per game</small></div><ul><li>Recorded breakdown</li><li>Player Development Worksheet PDF</li><li><span data-rule="turnaround_hours">72</span> hour turnaround from acceptance</li></ul></div>
      <div class="tier pro"><span class="badge">Highest level</span><h3>Pro</h3><p class="who">Played NHL, AHL, ECHL or top European pro leagues</p><div class="price"><span data-price="breakdown.pro">$1,000</span><small>per game</small></div><ul><li>Recorded breakdown</li><li>Player Development Worksheet PDF</li><li><span data-rule="turnaround_hours">72</span> hour turnaround from acceptance</li></ul></div>
    </div>
  </div>
</section>
<section class="band">
  <div class="wrap">
    <p class="kicker">Live</p>
    <h2>Film Room sessions</h2>
    <p class="muted">Booked from a mentor's profile inside their posted hours. Recorded, with a written recap within <span data-rule="recap_due_hours">24</span> hours.</p>
    <table>
      <thead><tr><th>Session</th><th>NCAA</th><th>PWHL</th><th>Pro</th></tr></thead>
      <tbody>
        <tr><td>Film Room · 30 minutes</td><td class="num" data-price="film_room_30.ncaa">$89</td><td class="num" data-price="film_room_30.pwhl">$119</td><td class="num" data-price="film_room_30.pro">$349</td></tr>
        <tr><td>Film Room · 60 minutes</td><td class="num" data-price="film_room_60.ncaa">$149</td><td class="num" data-price="film_room_60.pwhl">$199</td><td class="num" data-price="film_room_60.pro">$599</td></tr>
        <tr><td>Add-on · 30 minutes, within <span data-rule="addon_window_days">14</span> days of a breakdown</td><td class="num" data-price="addon_30.ncaa">$69</td><td class="num" data-price="addon_30.pwhl">$99</td><td class="num" data-price="addon_30.pro">$299</td></tr>
        <tr><td>Season Arc · <span data-rule="season_arc_sessions">4</span> sessions over <span data-rule="season_arc_weeks">8</span> weeks</td><td class="num" data-price="season_arc.ncaa">$299</td><td class="num" data-price="season_arc.pwhl">$399</td><td class="num" data-price="season_arc.pro">$1,199</td></tr>
      </tbody>
    </table>
    <p class="small" style="margin-top:14px">Free cancellation up to <span data-rule="session_cancel_hours">24</span> hours before a session. If a mentor can't confirm within <span data-rule="session_accept_hours">24</span> hours, you're refunded in full. Prices in US dollars.</p>
  </div>
</section>
<section>
  <div class="wrap" style="text-align:center">
    <h2>Pick the mentor first</h2>
    <p class="lead" style="margin:0 auto 24px">Every mentor's profile shows their tier, turnaround and reviews before you pay anything.</p>
    <div class="btns" style="justify-content:center"><a class="btn primary" data-app="/mentors" href="#">Browse FLP Mentors</a></div>
  </div>
</section>
''')

PAGES["faq.html"] = ("FAQ", "Answers for parents and for athletes who want to mentor.", '''
<section class="hero" style="padding-bottom:24px">
  <div class="wrap" style="grid-template-columns:1fr">
    <div><p class="kicker">Questions</p><h1>Straight <span class="gold">answers</span></h1><div class="rule"></div></div>
  </div>
</section>
<section class="tight">
  <div class="wrap">
    <h2 id="parents">For parents</h2>
    <details><summary>Who are the FLP Mentors?</summary><p>Current and former athletes who played NCAA, PWHL or professional hockey. Each applies, is reviewed by FLP, and is listed by the highest level they played. A Verified badge means FLP has confirmed that history.</p></details>
    <details><summary>Do I pick the mentor, or does FLP?</summary><p>You pick. Browse by position, read the profile and reviews, and choose. You can name a second choice in case your first can't take the job in time.</p></details>
    <details><summary>What if my first choice is at capacity?</summary><p>You can wait for them for a number of days you choose. If they don't free up, the job goes to your second choice. You're charged once at checkout either way.</p></details>
    <details><summary>How long does a breakdown take?</summary><p>Mentors have <span data-rule="accept_hours">48</span> hours to accept and <span data-rule="turnaround_hours">72</span> hours from accepting to deliver. You'll see the clock on your order page.</p></details>
    <details><summary>Can my youth athlete have their own login?</summary><p>No. Accounts belong to parents. Your youth athlete is a profile under your account, and there is no direct messaging between mentors and minors.</p></details>
    <details><summary>Is the Film Room recorded?</summary><p>Always. Recording starts the moment the mentor joins and nobody in the room can stop it. Parents may join any session. FLP keeps recordings for quality control and safeguarding.</p></details>
    <details><summary>What if the breakdown isn't good?</summary><p>File a Quality Control Audit from the order page within <span data-rule="qca_window_days">7</span> days. FLP reviews the video and worksheet and decides on a refund, a re-review by another mentor, or another fix. The mentor's payout is held while the audit is open.</p></details>
    <details><summary>Where does my film go?</summary><p>To a private video service. Only you, your chosen mentor once they've accepted, and FLP can view it. Links don't work without being signed in.</p></details>
    <h2 id="mentors" style="margin-top:48px">For mentors</h2>
    <details><summary>Who can apply?</summary><p>Athletes who played NCAA (D1, D3), U Sports, the PWHL, or professionally (NHL, AHL, ECHL, top European leagues). Junior-only careers aren't listed yet.</p></details>
    <details><summary>How much do I make?</summary><p>You keep the majority of every breakdown and Film Room at your tier. The exact split is shown in the application and on every request before you accept it.</p></details>
    <details><summary>How am I paid?</summary><p>Through Stripe. You connect a bank account once; each delivered breakdown and completed session adds to your ledger and FLP pays it out.</p></details>
    <details><summary>What tools do I need?</summary><p>A browser and a screen recorder you're comfortable with. Loom, QuickTime, OBS, your phone. You upload the recording to FLP and fill in the worksheet in the app.</p></details>
    <details><summary>Can I set my own hours?</summary><p>Yes. You choose how many breakdowns you hold at once and post the weekly windows when families can book a Film Room with you.</p></details>
  </div>
</section>
''')

PAGES["contact.html"] = ("Contact", "Get in touch with First Line Performance.", '''
<section class="hero" style="padding-bottom:24px">
  <div class="wrap" style="grid-template-columns:1fr">
    <div><p class="kicker">Contact</p><h1>Talk to <span class="gold">FLP</span></h1><div class="rule"></div>
    <p class="lead">Questions about an order, an application, or the platform: send it here and a person answers, usually within a business day. Or email <b>support@firstlineperform.com</b>.</p>
    </div>
  </div>
</section>
<section class="tight">
  <div class="wrap">
    <div class="grid cols2">
      <form id="contact" class="card" style="gap:14px;display:grid">
        <h3>Send a message</h3>
        <label class="small" for="c-name">Your name</label><input id="c-name" name="name" class="field" autocomplete="name">
        <label class="small" for="c-email">Email</label><input id="c-email" name="email" type="email" class="field" required autocomplete="email">
        <label class="small" for="c-subject">Subject</label><input id="c-subject" name="subject" class="field">
        <label class="small" for="c-body">What's going on?</label><textarea id="c-body" name="body" class="field" rows="6" required></textarea>
        <input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
        <button class="btn primary" type="submit">Send</button>
        <p id="c-status" class="small" aria-live="polite"></p>
      </form>
      <div>
        <div class="card" style="margin-bottom:16px"><h3>Parents</h3><p class="muted">Order questions are fastest from the order page in your account, where FLP can see the job.</p></div>
        <div class="card" style="margin-bottom:16px"><h3>Mentors</h3><p class="muted">Application status, payouts and profile questions: use the address you applied with.</p></div>
        <div class="card"><h3>Safety</h3><p class="muted">Anything concerning a minor's safety: put "Safeguarding" in the subject and it goes to the top of the queue.</p></div>
      </div>
    </div>
    <p class="small" style="margin-top:22px">First Line Performance LLC.</p>
  </div>
</section>
''')

PAGES["privacy.html"] = ("Privacy", "How First Line Performance handles family data, video, and payments.", '''
<section class="hero" style="padding-bottom:24px">
  <div class="wrap" style="grid-template-columns:1fr"><div><p class="kicker">Legal</p><h1>Privacy <span class="gold">policy</span></h1><div class="rule"></div>
  <p class="note">Draft. This page describes how the platform is built and will be replaced by the policy FLP's counsel approves before launch.</p></div></div>
</section>
<section class="tight legal">
  <div class="wrap">
    <h3>Accounts</h3><p>Accounts are created and owned by parents or guardians. A youth athlete is a profile under a parent account with a name, age group, position and level. Youth athletes do not have logins and cannot be contacted directly through the platform.</p>
    <h3>Video</h3><p>Game film, breakdowns and Film Room recordings are stored with our video providers (Mux for uploads and breakdowns, Daily for live sessions). Family film and breakdowns can only be viewed by the parent, the mentor on that order, and FLP staff, through links that require signing in. Film Room recordings are retained by FLP for <span data-rule="recording_retention_days">90</span> days for quality control and safeguarding, then deleted.</p>
    <h3>Payments</h3><p>Payments are processed by Stripe. FLP never receives or stores card numbers. Mentor payouts are made through Stripe Connect.</p>
    <h3>What we keep</h3><p>Order details, worksheets, recaps, ratings and reviews, and the notifications we send you, so that your youth athlete's Development Log and your order history are available to you.</p>
    <h3>What we don't do</h3><p>We do not sell personal information. We do not show a youth athlete's full name publicly; reviews on a mentor's profile show a parent's first name and the athlete's age group and position only.</p>
    <h3>Contact</h3><p>Privacy questions: <a href="mailto:team@firstlineperform.com">team@firstlineperform.com</a>.</p>
  </div>
</section>
''')

PAGES["terms.html"] = ("Terms", "Terms of service for First Line Performance.", '''
<section class="hero" style="padding-bottom:24px">
  <div class="wrap" style="grid-template-columns:1fr"><div><p class="kicker">Legal</p><h1>Terms of <span class="gold">service</span></h1><div class="rule"></div>
  <p class="note">Draft. These are the operating rules as built into the platform today; FLP's counsel will issue the binding terms before launch.</p></div></div>
</section>
<section class="tight legal">
  <div class="wrap">
    <h3>The service</h3><p>First Line Performance LLC ("FLP") operates a marketplace where parents order video breakdowns and live mentoring sessions for their youth athletes from independent athlete mentors ("FLP Mentors"). FLP Mentors are independent contractors, not employees of FLP.</p>
    <h3>Orders and payment</h3><p>Breakdowns are paid at checkout. A mentor has <span data-rule="accept_hours">48</span> hours to accept and <span data-rule="turnaround_hours">72</span> hours from acceptance to deliver. If no chosen mentor accepts, FLP assigns the order or refunds it.</p>
    <h3>Film Room sessions</h3><p>Sessions are paid at booking. Cancellations more than <span data-rule="session_cancel_hours">24</span> hours before the start are refunded in full; later cancellations by the parent are not refunded. A session cancelled by the mentor, or one the mentor does not attend, is refunded in full. Every session is recorded.</p>
    <h3>Quality Control Audit</h3><p>A parent may file an audit on a breakdown within <span data-rule="qca_window_days">7</span> days of delivery. FLP's decision (refund in part or full, reassignment, or dismissal) is final.</p>
    <h3>Conduct</h3><p>All communication between families and mentors takes place on the platform. Attempting to contact a youth athlete directly, or to move a relationship off the platform, ends a mentor's participation.</p>
    <h3>Contact</h3><p><a href="mailto:team@firstlineperform.com">team@firstlineperform.com</a></p>
  </div>
</section>
''')

CURRENT = {"index.html": "index.html", "how-it-works.html": "how-it-works.html", "for-mentors.html": "for-mentors.html", "pricing.html": "pricing.html", "faq.html": "faq.html"}
OUT.mkdir(exist_ok=True)
for slug, (title, desc, body) in PAGES.items():
    (OUT / slug).write_text(frame(title, desc, body, CURRENT.get(slug, "")))
print("wrote", ", ".join(PAGES))
