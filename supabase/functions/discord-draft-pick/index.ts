// Supabase Edge Function: discord-draft-pick
// Secret required: DISCORD_DRAFT_WEBHOOK_URL

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function stars(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const full = Math.floor(n);
  const half = n % 1 >= 0.5;
  return "★".repeat(full) + (half ? "½" : "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const webhookUrl = Deno.env.get("DISCORD_DRAFT_WEBHOOK_URL");
    if (!webhookUrl) {
      return new Response(JSON.stringify({ error: "Missing DISCORD_DRAFT_WEBHOOK_URL secret." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const pick = body?.pick || {};
    const team = body?.team || {};
    const nextPick = body?.next_pick || null;

    const pickNumber = String(pick.pick_number || "").padStart(2, "0");
    const user = pick.discord_username || "User TBD";
    const teamName = team.name || "Team TBD";
    const abbr = team.abbreviation || "";
    const conference = team.conference || "Conference TBD";
    const prestige = stars(team.draft_prestige);
    const ovr = team.draft_overall || "—";
    const off = team.draft_offense || "—";
    const def = team.draft_defense || "—";
    const boardScore = team.board_score || "—";
    const primary = String(team.primary_color || "#d4af37").replace("#", "");
    const nextLine = nextPick
      ? `Next on the clock: **Pick #${String(nextPick.pick_number).padStart(2, "0")} — ${nextPick.discord_username || "User TBD"}**`
      : "Draft complete.";

    const payload = {
      username: "CFBElite Draft Room",
      avatar_url: team.logo_url || undefined,
      embeds: [
        {
          title: "🚨 CFBELITE 27 DRAFT PICK IS IN",
          description: `With **Pick #${pickNumber}**, **${user}** selects **${teamName}**${abbr ? ` (**${abbr}**)` : ""}.`,
          color: Number.parseInt(primary, 16) || 13938487,
          thumbnail: team.logo_url ? { url: team.logo_url } : undefined,
          fields: [
            { name: "Conference", value: conference, inline: true },
            { name: "Prestige", value: prestige, inline: true },
            { name: "Board Score", value: String(boardScore), inline: true },
            { name: "Ratings", value: `OVR **${ovr}** | OFF **${off}** | DEF **${def}**`, inline: false },
            { name: "Up Next", value: nextLine, inline: false },
          ],
          footer: { text: "CFBElite 27 Draft Room" },
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const discordRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!discordRes.ok) {
      const details = await discordRes.text();
      return new Response(JSON.stringify({ error: "Discord webhook failed.", details }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error?.message || error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
