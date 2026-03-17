// supabase/functions/generate-commentary/index.ts
// Deploy with: supabase functions deploy generate-commentary

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JONATHAN_SYSTEM = `You are Jonathan Lessin — a golf handicapper and betting group coordinator who has been tracking "The Mush" NFL picks for 3+ years and betting the OPPOSITE of everything he picks. All-time record: Mush 196-261, you 261-196. You talk fast, a little profane, say "boys" and "LFG" and "FML". You love calling out:
- The Baltimore Ravens obsession (he's locked them 20+ times)
- "Bounce back week" declarations (never actually bounce back)
- The moon phase / atmospheric analysis (completely made up, zero predictive value)
- "All You Can Eat" bonus bets (fade them all)
- Mr. Thursday Night (1-4 documented record)
- The 3-13 week (your favorite memory: "he just kept muttering to himself on the phone")

You are analyzing this week's Mush picks and generating reactions for each one. The MORE exclamation points he uses on "LOCKS", the MORE confident you are fading them.

Parse every pick and return ONLY valid JSON (no markdown, no backticks):
{
  "weekAssessment": "1-2 sentence Jonathan take on the full card — reference specific picks, call out bounce back declarations, moon phases, etc",
  "riskLevel": "green|yellow|red",
  "riskReason": "brief reason e.g. bounce back declared = green for us",
  "moonPhase": "current moon phase name",
  "moonEmoji": "moon emoji matching phase",
  "atmosphericAlert": "a short sarcastic atmospheric alert like 'Gravitational vortex detected over AFC East. Affects short-yardage QBs by 0.3 inches. Data is data.'",
  "picks": [
    {
      "mushTeam": "Team Name",
      "spread": -3.5,
      "opponent": "Other Team",
      "isLock": true,
      "fadeHard": true,
      "gameWindow": "thursday|saturday|sunday_early|sunday_late|sunday_night|monday|special",
      "jonathanComment": "Short punchy reaction in Jonathan's voice. Call out Baltimore locks. Mock big spreads. Reference the counter-strategy."
    }
  ],
  "bonusBets": [
    {
      "description": "All you can eat over 44.5 Saints game",
      "betType": "over_under|parlay|prop|lunar|atmospheric",
      "jonathanComment": "All you can eat. Classic. The moon is in whatever phase he said. Take the under. Maximum size boys."
    }
  ]
}`;

// Calculate actual moon phase
function getMoonPhase(date: Date): { name: string; emoji: string } {
  const knownNewMoon = new Date("2024-01-11");
  const daysSince = (date.getTime() - knownNewMoon.getTime()) / (1000 * 60 * 60 * 24);
  const cycle = 29.53;
  const phase = ((daysSince % cycle) + cycle) % cycle;

  if (phase < 1.85) return { name: "New Moon", emoji: "🌑" };
  if (phase < 7.38) return { name: "Waxing Crescent", emoji: "🌒" };
  if (phase < 9.22) return { name: "First Quarter", emoji: "🌓" };
  if (phase < 14.77) return { name: "Waxing Gibbous", emoji: "🌔" };
  if (phase < 16.61) return { name: "Full Moon", emoji: "🌕" };
  if (phase < 22.15) return { name: "Waning Gibbous", emoji: "🌖" };
  if (phase < 23.99) return { name: "Last Quarter", emoji: "🌗" };
  return { name: "Waning Crescent", emoji: "🌘" };
}

const ATMOSPHERIC_ALERTS = [
  "Barometric pressure dropping over NFC East. Affects field goal trajectory by 0.7%. Bookmakers unaware.",
  "Gravitational vortex forming over Los Angeles. High-angle QB throws impacted. Data is data.",
  "Waning Gibbous phase detected. Short-radius throwing mechanics compromised. Bet accordingly.",
  "Atmospheric moisture at 67% in Miami. Tua's grip affected. He has never won in high humidity.",
  "Polar vortex remnants detected over Chicago. Model adjusted. Bears getting extra 2.1 points.",
  "Solar flare activity elevated. Impacts helmet radio communications. Favor teams with hand signals.",
  "Moon aligned with Venus over KC. Chiefs kicker range reduced by 3 yards. Unders are live.",
  "Jet stream shifted south. Favors ground games in dome stadiums. The data does not lie.",
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { weekId, rawText, jwt } = await req.json();

    // Verify the user is admin
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (!profile || profile.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // Call Claude API
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 3000,
        system: JONATHAN_SYSTEM,
        messages: [{ role: "user", content: `This week's Mush picks:\n\n${rawText}\n\nParse every pick and generate Jonathan's full commentary card.` }],
      }),
    });

    if (!anthropicRes.ok) throw new Error(`Claude API error: ${anthropicRes.status}`);
    const anthropicData = await anthropicRes.json();
    const rawJson = anthropicData.content[0].text.replace(/```json|```/g, "").trim();
    const commentary = JSON.parse(rawJson);

    // Get moon phase
    const moon = getMoonPhase(new Date());
    commentary.moonPhase = commentary.moonPhase || moon.name;
    commentary.moonEmoji = commentary.moonEmoji || moon.emoji;
    commentary.atmosphericAlert = commentary.atmosphericAlert ||
      ATMOSPHERIC_ALERTS[Math.floor(Math.random() * ATMOSPHERIC_ALERTS.length)];

    // Save to database
    // Update week
    await supabase.from("weeks").update({
      jonathan_assessment: commentary.weekAssessment,
      week_risk: commentary.riskLevel || "yellow",
      moon_phase: commentary.moonPhase,
      moon_emoji: commentary.moonEmoji,
      atmospheric_alert: commentary.atmosphericAlert,
      mush_raw_text: rawText,
    }).eq("id", weekId);

    // Delete existing picks for this week (re-generate)
    await supabase.from("picks").delete().eq("week_id", weekId);
    await supabase.from("bonus_bets").delete().eq("week_id", weekId);

    // Insert picks
    if (commentary.picks?.length) {
      const picksToInsert = commentary.picks.map((p: any, i: number) => ({
        week_id: weekId,
        sort_order: i,
        mush_team: p.mushTeam || p.mushPick || "Unknown",
        spread: p.spread || 0,
        opponent: p.opponent || "Unknown",
        is_lock: p.isLock || false,
        fade_hard: p.fadeHard || false,
        game_window: p.gameWindow || "sunday_early",
        jonathan_comment: p.jonathanComment || "",
      }));
      await supabase.from("picks").insert(picksToInsert);
    }

    // Insert bonus bets
    if (commentary.bonusBets?.length) {
      const bonusToInsert = commentary.bonusBets.map((b: any) => ({
        week_id: weekId,
        description: b.description || "",
        bet_type: b.betType || "over_under",
        jonathan_comment: b.jonathanComment || "",
      }));
      await supabase.from("bonus_bets").insert(bonusToInsert);
    }

    return new Response(JSON.stringify({ success: true, commentary }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});