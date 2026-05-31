import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const WEEKS = ["Week 1","Week 2","Week 3","Week 4","Week 5","Week 6","Week 7","Week 8","Week 9","Week 10","Week 11","Week 12","Week 13","Week 14","Conference Championship Week","Bowl Week 1","Bowl Week 2","Bowl Week 3","National Championship Week"];
const POSITIONS = ["Coach","QB","RB","WR","TE","LT","LG","C","RG","RT","EDGE","DT","SAM","WILL","MIKE","CB","FS","SS","KR","PR","K","P"];
const YEARS = Array.from({ length: 25 }, (_, index) => String(2026 + index));
const ALL_AMERICAN_TYPES = ["First-Team", "Second-Team", "Freshman"];
const AWARD_NAMES = ["Bear Bryant COTY Award","Broyels Award - Top Coordinator","Unitas Golden Arm","Davey O'Brien Award","Edge Rusher of The Year","Fred Biletnikoff Award","Chuck Bednarik Award","Bronko Nagurski Award","Doak Walker Award","John Mackey Award","Lombardi Award","Lou Groza Award","Maxwell Award","Walter Camp Award","Outland Trophy","Paycom Jim Thorpe Award","Ray Guy Award","Rimington Award","Jet Award","Dick Butkus Award","Shaun Alexander Award"];

const EMPTY_RESULT = { season_year: 2029, week: "Week 1", team_1_id: "", team_2_id: "", team_1_user_id: "", team_2_user_id: "", team_1_score: "", team_2_score: "", team_1_rank: "", team_2_rank: "", tags: "User vs User" };
const EMPTY_RECRUITING = { season_year: 2029, rank: "" };

function scoreNumber(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function recordFromResults(teamId, results, year = null) {
  const filtered = results.filter((r) => (!year || String(r.season_year) === String(year)) && (r.team_1_id === teamId || r.team_2_id === teamId));
  let wins = 0; let losses = 0; let pf = 0; let pa = 0;
  filtered.forEach((r) => {
    const isTeam1 = r.team_1_id === teamId;
    const forPts = isTeam1 ? r.team_1_score : r.team_2_score;
    const againstPts = isTeam1 ? r.team_2_score : r.team_1_score;
    pf += Number(forPts || 0); pa += Number(againstPts || 0);
    if (forPts > againstPts) wins += 1; else if (forPts < againstPts) losses += 1;
  });
  return { wins, losses, pf, pa, games: filtered.length, avgPf: filtered.length ? (pf / filtered.length).toFixed(1) : "0.0", avgPa: filtered.length ? (pa / filtered.length).toFixed(1) : "0.0" };
}
function top25Wins(teamId, results) {
  return results.filter((r) => {
    const team1Won = r.team_1_id === teamId && r.team_1_score > r.team_2_score && r.team_2_rank >= 1 && r.team_2_rank <= 25;
    const team2Won = r.team_2_id === teamId && r.team_2_score > r.team_1_score && r.team_1_rank >= 1 && r.team_1_rank <= 25;
    return team1Won || team2Won;
  }).length;
}
function titleCount(teamId, results, week) { return results.filter((r) => r.week === week && ((r.team_1_id === teamId && r.team_1_score > r.team_2_score) || (r.team_2_id === teamId && r.team_2_score > r.team_1_score))).length; }
function bowlRecord(teamId, results) { return recordFromResults(teamId, results.filter((r) => ["Bowl Week 1","Bowl Week 2","Bowl Week 3","National Championship Week"].includes(r.week))); }
function rankingRows(teams, rows, field = "team_id") { return teams.map((t) => ({ team: t.name, total: rows.filter((r) => r[field] === t.id).length })).sort((a,b) => b.total - a.total || a.team.localeCompare(b.team)); }

function clampSor(value) {
  return Math.max(0.1, Math.min(10, value));
}

function pollRankDifficulty(rank) {
  const number = Number(rank);
  if (!number || number < 1 || number > 25) return 0.1;
  return 10 - ((number - 1) / 24) * 4;
}

function userStandingRankMap(teams, results) {
  const ordered = teams
    .map((team) => ({ team, record: recordFromResults(team.id, results) }))
    .sort((a, b) => b.record.wins - a.record.wins || a.record.losses - b.record.losses || a.team.name.localeCompare(b.team.name));

  const map = new Map();
  ordered.forEach((row, index) => map.set(row.team.id, index + 1));
  return map;
}

function standingRankDifficulty(teamId, teams, results) {
  if (!teams.length) return 0.1;
  const rankMap = userStandingRankMap(teams, results);
  const rank = rankMap.get(teamId) || teams.length;
  if (teams.length === 1) return 10;
  return 10 - ((rank - 1) / (teams.length - 1)) * 9.9;
}

function recordDifficulty(teamId, results) {
  const record = recordFromResults(teamId, results);
  if (!record.games) return 5;
  const winPct = record.wins / record.games;
  return 0.1 + winPct * 9.9;
}

function strengthOfResult(teamId, teams, results) {
  const games = results.filter((result) => result.team_1_id === teamId || result.team_2_id === teamId);
  if (!games.length) return "—";

  const total = games.reduce((sum, result) => {
    const isTeam1 = result.team_1_id === teamId;
    const opponentId = isTeam1 ? result.team_2_id : result.team_1_id;
    const opponentRank = isTeam1 ? result.team_2_rank : result.team_1_rank;

    const standingsScore = standingRankDifficulty(opponentId, teams, results);
    const recordScore = recordDifficulty(opponentId, results);
    const rankedScore = pollRankDifficulty(opponentRank);

    const gameDifficulty = (standingsScore * 0.45) + (recordScore * 0.35) + (rankedScore * 0.20);
    return sum + clampSor(gameDifficulty);
  }, 0);

  return clampSor(total / games.length).toFixed(1);
}

function getHelmetUrl(team) {
  return team?.helmet_url || team?.helmet || team?.logo_url || team?.logo || team?.image_url || "";
}

function TeamLabel({ team, name }) {
  const displayName = name || team?.name || team?.team_name || "—";
  const helmetUrl = getHelmetUrl(team);

  return (
    <span style={teamLabel}>
      {helmetUrl ? (
        <img src={helmetUrl} alt="" style={helmetIcon} />
      ) : (
        <span style={helmetFallback}>🏈</span>
      )}
      <span>{displayName}</span>
    </span>
  );
}

function championshipRowsByDiscord(champions) {
  const map = new Map();

  champions.forEach((champion) => {
    const discord = champion.discord_users?.discord_username || "Unassigned";
    const teamName = champion.teams?.name || "Team TBD";
    const year = champion.season_year || "Year TBD";

    if (!map.has(discord)) {
      map.set(discord, { discord, total: 0, teams: [] });
    }

    const row = map.get(discord);
    row.total += 1;
    row.teams.push(`${year} ${teamName}`);
  });

  return [...map.values()].sort((a, b) => b.total - a.total || a.discord.localeCompare(b.discord));
}

function coachForTeamYear(teamId, year, assignments) {
  const yearNumber = Number(year);
  const matches = assignments.filter((assignment) => {
    if (assignment.team_id !== teamId || !assignment.discord_user_id) return false;
    const start = Number(assignment.start_year || 0);
    const end = assignment.end_year ? Number(assignment.end_year) : 9999;
    return yearNumber >= start && yearNumber <= end;
  });

  return matches.find((assignment) => assignment.status === "Active") || matches[0] || assignments.find((assignment) => assignment.team_id === teamId && assignment.status === "Active") || null;
}

function activeCoachForTeam(teamId, assignments) {
  return assignments.find((assignment) => assignment.team_id === teamId && assignment.status === "Active") || null;
}

function teamNameById(teamId, teams) {
  return teams.find((team) => team.id === teamId)?.name || "Unknown Team";
}

function getCoachStats(users, teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting) {
  const userMap = new Map();
  users.forEach((user) => {
    userMap.set(user.id, {
      userId: user.id,
      discord: user.discord_username,
      teamsCoached: new Set(),
      activeTeams: [],
      wins: 0,
      losses: 0,
      pf: 0,
      pa: 0,
      top25Wins: 0,
      confTitles: 0,
      nattysFromResults: 0,
      nattysRecorded: 0,
      bowlWins: 0,
      bowlLosses: 0,
      awards: 0,
      allAmericans: 0,
      heismans: 0,
      top25Classes: 0,
      rawPrestige: 0,
      prestige: 0,
    });
  });

  function ensureUser(userId, fallbackName = "Unassigned") {
    if (!userId) return null;
    if (!userMap.has(userId)) {
      userMap.set(userId, {
        userId,
        discord: fallbackName,
        teamsCoached: new Set(),
        activeTeams: [],
        wins: 0,
        losses: 0,
        pf: 0,
        pa: 0,
        top25Wins: 0,
        confTitles: 0,
        nattysFromResults: 0,
        nattysRecorded: 0,
        bowlWins: 0,
        bowlLosses: 0,
        awards: 0,
        allAmericans: 0,
        heismans: 0,
        top25Classes: 0,
        rawPrestige: 0,
        prestige: 0,
      });
    }
    return userMap.get(userId);
  }

  assignments.forEach((assignment) => {
    const row = ensureUser(assignment.discord_user_id, assignment.discord_users?.discord_username || "Unassigned");
    if (!row) return;
    const name = assignment.teams?.name || teamNameById(assignment.team_id, teams);
    row.teamsCoached.add(name);
    if (assignment.status === "Active") row.activeTeams.push(name);
  });

  results.forEach((result) => {
    const team1UserId = result.team_1_user_id || coachForTeamYear(result.team_1_id, result.season_year, assignments)?.discord_user_id;
    const team2UserId = result.team_2_user_id || coachForTeamYear(result.team_2_id, result.season_year, assignments)?.discord_user_id;
    const team1 = ensureUser(team1UserId, result.user_1?.discord_username || "Unassigned");
    const team2 = ensureUser(team2UserId, result.user_2?.discord_username || "Unassigned");
    const s1 = Number(result.team_1_score || 0);
    const s2 = Number(result.team_2_score || 0);
    const isBowl = ["Bowl Week 1", "Bowl Week 2", "Bowl Week 3", "National Championship Week"].includes(result.week);

    if (team1) { team1.pf += s1; team1.pa += s2; }
    if (team2) { team2.pf += s2; team2.pa += s1; }

    if (s1 > s2) {
      if (team1) team1.wins += 1;
      if (team2) team2.losses += 1;
      if (team1 && Number(result.team_2_rank) >= 1 && Number(result.team_2_rank) <= 25) team1.top25Wins += 1;
      if (result.week === "Conference Championship Week" && team1) team1.confTitles += 1;
      if (result.week === "National Championship Week" && team1) team1.nattysFromResults += 1;
      if (isBowl) { if (team1) team1.bowlWins += 1; if (team2) team2.bowlLosses += 1; }
    } else if (s2 > s1) {
      if (team2) team2.wins += 1;
      if (team1) team1.losses += 1;
      if (team2 && Number(result.team_1_rank) >= 1 && Number(result.team_1_rank) <= 25) team2.top25Wins += 1;
      if (result.week === "Conference Championship Week" && team2) team2.confTitles += 1;
      if (result.week === "National Championship Week" && team2) team2.nattysFromResults += 1;
      if (isBowl) { if (team2) team2.bowlWins += 1; if (team1) team1.bowlLosses += 1; }
    }
  });

  function awardUserForTeamYear(row, counter) {
    const assignment = coachForTeamYear(row.team_id, row.season_year, assignments);
    const coach = ensureUser(assignment?.discord_user_id, assignment?.discord_users?.discord_username || "Unassigned");
    if (coach) coach[counter] += 1;
  }

  allAmericans.forEach((row) => awardUserForTeamYear(row, "allAmericans"));
  awards.forEach((row) => awardUserForTeamYear(row, "awards"));
  heismans.forEach((row) => awardUserForTeamYear(row, "heismans"));
  recruiting.forEach((row) => {
    if (Number(row.rank) >= 1 && Number(row.rank) <= 25) awardUserForTeamYear(row, "top25Classes");
  });
  nationalChampions.forEach((row) => {
    const coach = ensureUser(row.discord_user_id || coachForTeamYear(row.team_id, row.season_year, assignments)?.discord_user_id, row.discord_users?.discord_username || "Unassigned");
    if (coach) coach.nattysRecorded += 1;
  });

  const rows = [...userMap.values()].map((row) => {
    const games = row.wins + row.losses;
    const winPct = games ? row.wins / games : 0;
    const nattys = Math.max(row.nattysRecorded, row.nattysFromResults);
    const rawPrestige =
      nattys * 30 +
      row.confTitles * 15 +
      row.top25Wins * 4 +
      row.wins * 1.5 +
      row.bowlWins * 3 +
      row.heismans * 12 +
      row.awards * 4 +
      row.allAmericans * 2 +
      row.top25Classes * 3 +
      winPct * 10;

    return {
      ...row,
      games,
      winPct,
      nattys,
      rawPrestige,
      teamsCoachedText: [...row.teamsCoached].sort().join(", ") || "—",
      activeTeamsText: row.activeTeams.sort().join(", ") || "—",
    };
  });

  const maxRaw = Math.max(1, ...rows.map((row) => row.rawPrestige));
  return rows
    .map((row) => ({ ...row, prestige: Number(((row.rawPrestige / maxRaw) * 100).toFixed(1)) }))
    .sort((a, b) => b.prestige - a.prestige || b.wins - a.wins || a.discord.localeCompare(b.discord));
}

function recordBookRows(users, teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting) {
  const coachRows = getCoachStats(users, teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting);
  const activeTeams = teams.filter((team) => assignments.some((assignment) => assignment.team_id === team.id && assignment.status === "Active"));
  const teamRows = activeTeams.map((team) => {
    const rec = recordFromResults(team.id, results);
    return {
      label: team.name,
      wins: rec.wins,
      games: rec.games,
      avgPf: Number(rec.avgPf),
      top25: top25Wins(team.id, results),
      conf: titleCount(team.id, results, "Conference Championship Week"),
      nattys: titleCount(team.id, results, "National Championship Week"),
      sor: Number(strengthOfResult(team.id, activeTeams, results)) || 0,
    };
  });

  const best = (rows, key, label, formatter = (value) => value) => {
    const row = [...rows].sort((a, b) => Number(b[key] || 0) - Number(a[key] || 0))[0];
    return { record: label, holder: row?.discord || row?.label || "—", value: row ? formatter(row[key], row) : "—" };
  };

  return [
    best(coachRows, "prestige", "Highest coach prestige", (value) => Number(value).toFixed(1)),
    best(coachRows, "wins", "Most coach wins"),
    best(coachRows, "nattys", "Most national titles"),
    best(coachRows, "confTitles", "Most conference titles"),
    best(coachRows, "top25Wins", "Most Top 25 wins"),
    best(coachRows, "heismans", "Most Heisman winners"),
    best(teamRows, "wins", "Most active team wins"),
    best(teamRows, "avgPf", "Highest active team Avg PF", (value) => Number(value).toFixed(1)),
    best(teamRows, "top25", "Most active team Top 25 wins"),
    best(teamRows, "sor", "Toughest active team SOR", (value) => Number(value).toFixed(1)),
  ];
}

function weeklyNewsItems(results, teams, currentYear, currentWeek) {
  const weekResults = results.filter((row) => String(row.season_year) === String(currentYear) && row.week === currentWeek);
  const latest = weekResults.length ? weekResults : results.slice(0, 10);

  if (!latest.length) return ["No games have been recorded yet. Once results are entered, this page will automatically generate storylines."];

  const items = latest.map((game) => {
    const team1 = game.team_1?.name || teamNameById(game.team_1_id, teams);
    const team2 = game.team_2?.name || teamNameById(game.team_2_id, teams);
    const s1 = Number(game.team_1_score || 0);
    const s2 = Number(game.team_2_score || 0);
    const winner = s1 >= s2 ? team1 : team2;
    const loser = s1 >= s2 ? team2 : team1;
    const winScore = Math.max(s1, s2);
    const loseScore = Math.min(s1, s2);
    const margin = Math.abs(s1 - s2);
    const rankedLoser = s1 > s2 ? game.team_2_rank : game.team_1_rank;
    const rankedText = Number(rankedLoser) >= 1 && Number(rankedLoser) <= 25 ? ` over ranked #${rankedLoser} ${loser}` : ` over ${loser}`;
    return { text: `${winner} defeated${rankedText}, ${winScore}-${loseScore}.`, margin, total: s1 + s2 };
  });

  const closest = [...items].sort((a, b) => a.margin - b.margin)[0];
  const biggest = [...items].sort((a, b) => b.margin - a.margin)[0];
  const highest = [...items].sort((a, b) => b.total - a.total)[0];

  return [
    `${latest.length} result${latest.length === 1 ? "" : "s"} recorded for ${weekResults.length ? currentWeek : "the latest games on file"}.`,
    closest ? `Closest game: ${closest.text}` : null,
    biggest ? `Biggest statement: ${biggest.text}` : null,
    highest ? `Highest-scoring game: ${highest.text}` : null,
    ...items.slice(0, 8).map((item) => item.text),
  ].filter(Boolean);
}

function sortableValue(value) {
  const number = Number(value);
  if (Number.isFinite(number)) return number;
  return String(value || "").toLowerCase();
}

function compareForSort(a, b, key, direction) {
  const multiplier = direction === "asc" ? 1 : -1;

  if (key === "record") {
    const aWinPct = a.games ? a.wins / a.games : 0;
    const bWinPct = b.games ? b.wins / b.games : 0;
    if (aWinPct !== bWinPct) return (aWinPct - bWinPct) * multiplier;
    if (a.wins !== b.wins) return (a.wins - b.wins) * multiplier;
    if (a.losses !== b.losses) return (b.losses - a.losses) * multiplier;
    return a.teamName.localeCompare(b.teamName);
  }

  const av = sortableValue(a[key]);
  const bv = sortableValue(b[key]);

  if (typeof av === "number" && typeof bv === "number") {
    if (av !== bv) return (av - bv) * multiplier;
    return a.teamName.localeCompare(b.teamName);
  }

  const textCompare = String(av).localeCompare(String(bv));
  return textCompare * multiplier;
}

function SortButton({ label, sortKey, sortState, setSortState }) {
  const active = sortState?.key === sortKey;
  const arrow = active ? (sortState.direction === "desc" ? " ▼" : " ▲") : "";

  return (
    <button
      type="button"
      onClick={() =>
        setSortState((prev) => ({
          key: sortKey,
          direction: prev?.key === sortKey && prev.direction === "desc" ? "asc" : "desc",
        }))
      }
      style={sortButton}
    >
      {label}{arrow}
    </button>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [currentYear, setCurrentYear] = useState("2029");
  const [currentWeek, setCurrentWeek] = useState("Week 1");
  const [teams, setTeams] = useState([]);
  const [users, setUsers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [standings, setStandings] = useState([]);
  const [results, setResults] = useState([]);
  const [allAmericans, setAllAmericans] = useState([]);
  const [awards, setAwards] = useState([]);
  const [heismans, setHeismans] = useState([]);
  const [nationalChampions, setNationalChampions] = useState([]);
  const [draftOrder, setDraftOrder] = useState([]);
  const [playoffGames, setPlayoffGames] = useState([]);
  const [recruiting, setRecruiting] = useState([]);
  const [historyRows, setHistoryRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [standingsOrder, setStandingsOrder] = useState([]);
  const [commissionerRankings, setCommissionerRankings] = useState([]);
  const [draggedStanding, setDraggedStanding] = useState(null);
  const [userSort, setUserSort] = useState({ key: "record", direction: "desc" });
  const [commissionerSort, setCommissionerSort] = useState({ key: "manual", direction: "desc" });
  const [error, setError] = useState("");
  const [search, setSearch] = useState({ standings: "", results: "", assignments: "", allAmericans: "", awards: "", h2h: "" });
  const [newResult, setNewResult] = useState(EMPTY_RESULT);
  const [newRecruiting, setNewRecruiting] = useState(EMPTY_RECRUITING);
  const [newHistory, setNewHistory] = useState({ season_year: 2029, record: "0-0" });
  const [draftAssignments, setDraftAssignments] = useState({});
  const [draftAllAmericans, setDraftAllAmericans] = useState({});
  const [draftAwards, setDraftAwards] = useState({});
  const [draftHeismans, setDraftHeismans] = useState({});
  const [draftChampions, setDraftChampions] = useState({});
  const [draftDraftOrder, setDraftDraftOrder] = useState({});
  const [draftPlayoff, setDraftPlayoff] = useState({});
  const [teamChange, setTeamChange] = useState({ discord_user_id: "", new_team_id: "", start_year: 2029 });

  const teamOptions = useMemo(() => [...teams].sort((a, b) => a.name.localeCompare(b.name)), [teams]);
  const userOptions = useMemo(() => [...users].sort((a, b) => a.discord_username.localeCompare(b.discord_username)), [users]);
  const activeTeamIds = useMemo(() => new Set(
    assignments
      .filter((assignment) => assignment.status === "Active" && assignment.team_id)
      .map((assignment) => assignment.team_id)
  ), [assignments]);
  const activeTeamOptions = useMemo(() => teamOptions.filter((team) => activeTeamIds.has(team.id)), [teamOptions, activeTeamIds]);
  const selectedTeam = activeTab.startsWith("team-") ? teams.find((team) => `team-${team.id}` === activeTab) : null;
  const currentYearResults = results.filter((r) => String(r.season_year) === String(currentYear));
  const orderedStandings = standingsOrder.length
    ? standingsOrder.map((id) => standings.find((row) => row.team_id === id)).filter(Boolean)
    : standings;
  function goToTeam(teamId) { setActiveTab(`team-${teamId}`); }
  async function saveCommissionerRankings(order) {
    const activeOrder = order.filter((teamId) => activeTeamIds.has(teamId));
    const payload = activeOrder.map((teamId, index) => ({
      team_id: teamId,
      rank: index + 1,
      updated_at: new Date().toISOString(),
    }));

    if (!payload.length) return;

    const { error: rankingError } = await supabase
      .from("commissioner_rankings")
      .upsert(payload, { onConflict: "team_id" });

    if (rankingError) {
      setError(`Commissioner ranking save failed: ${rankingError.message}`);
      return;
    }

    setError("");
  }

  async function reorderStandings(dropTeamId) {
    if (!draggedStanding || !dropTeamId || draggedStanding === dropTeamId) return;

    const base = standingsOrder.length ? standingsOrder : standings.map((row) => row.team_id);
    const next = [...base];
    const fromIndex = next.indexOf(draggedStanding);
    const toIndex = next.indexOf(dropTeamId);

    if (fromIndex === -1 || toIndex === -1) {
      setDraggedStanding(null);
      return;
    }

    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);

    setStandingsOrder(next);
    setDraggedStanding(null);
    setCommissionerSort({ key: "manual", direction: "desc" });
    await saveCommissionerRankings(next);
  }

  const tabs = [["dashboard","Dashboard"],["prestige","Prestige"],["recordBook","Record Book"],["weeklyNews","Weekly News"],["assignments","Users/Team Assignments"],["h2h","User vs User H2H"],["allAmericans","All-Americans"],["awards","Awards"],["heismans","Heisman Winners"],["nationalChampions","National Champions"],...activeTeamOptions.map((team) => [`team-${team.id}`, team.name])];

  async function loadData() {
    setLoading(true); setError("");
    const [teamsRes, settingsRes, usersRes, assignmentsRes, standingsRes, rankingsRes, resultsRes, aaRes, awardsRes, heismanRes, championsRes, draftRes, playoffRes, recruitingRes, historyRes] = await Promise.all([
      supabase.from("teams").select("*").order("name"),
      supabase.from("league_settings").select("*").eq("id", 1).single(),
      supabase.from("discord_users").select("*").order("discord_username"),
      supabase.from("team_assignments").select("*, teams(name), discord_users(discord_username)").order("created_at"),
      supabase.from("team_standings").select("*").order("team_name"),
      supabase.from("commissioner_rankings").select("*").order("rank"),
      supabase.from("game_results").select(`*, team_1:teams!game_results_team_1_id_fkey(*), team_2:teams!game_results_team_2_id_fkey(*), user_1:discord_users!game_results_team_1_user_id_fkey(discord_username), user_2:discord_users!game_results_team_2_user_id_fkey(discord_username)`).order("created_at", { ascending: false }),
      supabase.from("all_americans").select("*, teams(name)").order("season_year", { ascending: false }),
      supabase.from("awards").select("*, teams(name)").order("season_year", { ascending: false }),
      supabase.from("heisman_winners").select("*, teams(name)").order("season_year", { ascending: false }),
      supabase.from("national_champions").select("*, teams(name), discord_users(discord_username)").order("season_year", { ascending: false }),
      supabase.from("draft_order_27").select("*, discord_users(discord_username)").order("pick_number"),
      supabase.from("playoff_games").select(`*, top_team:teams!playoff_games_top_team_id_fkey(name), bottom_team:teams!playoff_games_bottom_team_id_fkey(name)`).order("sort_order"),
      supabase.from("recruiting_classes").select("*, teams(name)").order("season_year", { ascending: false }),
      supabase.from("team_history_records").select("*, teams(name)").order("season_year", { ascending: false }),
    ]);
    const firstError = [teamsRes, settingsRes, usersRes, assignmentsRes, standingsRes, rankingsRes, resultsRes, aaRes, awardsRes, heismanRes, championsRes, draftRes, playoffRes, recruitingRes, historyRes].find((r) => r.error)?.error;
    if (firstError) setError(firstError.message);
    else {
      if (settingsRes.data) {
        setCurrentYear(String(settingsRes.data.current_year));
        setCurrentWeek(settingsRes.data.current_week);
        setNewResult((prev) => ({
          ...prev,
          season_year: Number(settingsRes.data.current_year),
          week: settingsRes.data.current_week,
        }));
      }
      setTeams(teamsRes.data || []); setUsers(usersRes.data || []);
      setAssignments((assignmentsRes.data || []).sort((a,b) => (a.teams?.name || "").localeCompare(b.teams?.name || "")));
      const loadedStandings = standingsRes.data || [];
      const loadedRankings = rankingsRes.data || [];
      setStandings(loadedStandings);
      setCommissionerRankings(loadedRankings);

      const standingIds = loadedStandings.map((row) => row.team_id);
      const rankedIds = loadedRankings
        .sort((a, b) => a.rank - b.rank)
        .map((row) => row.team_id)
        .filter((id) => standingIds.includes(id));
      const unrankedIds = standingIds
        .filter((id) => !rankedIds.includes(id))
        .sort((a, b) => {
          const aName = loadedStandings.find((row) => row.team_id === a)?.team_name || "";
          const bName = loadedStandings.find((row) => row.team_id === b)?.team_name || "";
          return aName.localeCompare(bName);
        });

      setStandingsOrder([...rankedIds, ...unrankedIds]);
      setResults(resultsRes.data || []); setAllAmericans(aaRes.data || []); setAwards(awardsRes.data || []); setHeismans(heismanRes.data || []); setNationalChampions(championsRes.data || []); setDraftOrder(draftRes.data || []); setPlayoffGames(playoffRes.data || []); setRecruiting(recruitingRes.data || []);
      setHistoryRows(historyRes.data || []);
    }
    setLoading(false);
  }
  useEffect(() => { loadData(); }, []);

  async function submitResult() {
    const team1Score = scoreNumber(newResult.team_1_score); const team2Score = scoreNumber(newResult.team_2_score);
    if (!newResult.team_1_id || !newResult.team_2_id || team1Score === null || team2Score === null) { setError("Please select both teams and enter both scores."); return; }
    const { error: insertError } = await supabase.from("game_results").insert({ season_year: Number(newResult.season_year), week: newResult.week, team_1_id: newResult.team_1_id, team_2_id: newResult.team_2_id, team_1_user_id: newResult.team_1_user_id || null, team_2_user_id: newResult.team_2_user_id || null, team_1_score: team1Score, team_2_score: team2Score, team_1_rank: newResult.team_1_rank ? Number(newResult.team_1_rank) : null, team_2_rank: newResult.team_2_rank ? Number(newResult.team_2_rank) : null, tags: newResult.tags.split(",").map((tag) => tag.trim()).filter(Boolean) });
    if (insertError) { setError(insertError.message); return; }
    setNewResult({ ...EMPTY_RESULT, season_year: Number(currentYear), week: currentWeek }); await loadData();
  }
  async function deleteRow(table, id) { const { error: deleteError } = await supabase.from(table).delete().eq("id", id); if (deleteError) setError(deleteError.message); await loadData(); }
  async function updateRow(table, id, field, value) { const { error: updateError } = await supabase.from(table).update({ [field]: value === "" ? null : value }).eq("id", id); if (updateError) setError(updateError.message); else setError(""); await loadData(); }
  async function updateLeagueSetting(field, value) {
    const payload = {
      [field]: field === "current_year" ? Number(value) : value,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from("league_settings")
      .update(payload)
      .eq("id", 1);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setError("");

    if (field === "current_year") {
      setCurrentYear(String(value));
      setNewResult((prev) => ({ ...prev, season_year: Number(value) }));
    }

    if (field === "current_week") {
      setCurrentWeek(value);
      setNewResult((prev) => ({ ...prev, week: value }));
    }
  }
  async function saveLeagueSettings() {
    const payload = {
      id: 1,
      current_year: Number(currentYear),
      current_week: currentWeek,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from("league_settings")
      .upsert(payload, { onConflict: "id" });

    if (upsertError) {
      setError(upsertError.message);
      return;
    }

    setNewResult((prev) => ({
      ...prev,
      season_year: Number(currentYear),
      week: currentWeek,
    }));
    setError("");
    await loadData();
  }

  async function saveDraft(table, id, draft, numericFields = []) {
    const payload = {};
    Object.entries(draft || {}).forEach(([key, value]) => {
      payload[key] = numericFields.includes(key) && value !== "" && value !== null ? Number(value) : value === "" ? null : value;
    });
    if (!Object.keys(payload).length) return;
    const { error: updateError } = await supabase.from(table).update(payload).eq("id", id);
    if (updateError) { setError(updateError.message); return; }
    setError("");
    await loadData();
  }
  function getDraft(drafts, row) { return { ...row, ...(drafts[row.id] || {}) }; }
  async function changeUserTeam() {
    if (!teamChange.discord_user_id || !teamChange.new_team_id) { setError("Select a Discord user and new team first."); return; }
    const year = Number(teamChange.start_year || currentYear);
    const activeRows = assignments.filter((row) => row.discord_user_id === teamChange.discord_user_id && row.status === "Active");
    for (const row of activeRows) {
      const { error: endError } = await supabase.from("team_assignments").update({ status: "Former", end_year: year }).eq("id", row.id);
      if (endError) { setError(endError.message); return; }
    }
    const { error: insertError } = await supabase.from("team_assignments").insert({ discord_user_id: teamChange.discord_user_id, team_id: teamChange.new_team_id, start_year: year, status: "Active" });
    if (insertError) { setError(insertError.message); return; }
    setTeamChange({ discord_user_id: "", new_team_id: "", start_year: year });
    setError("");
    await loadData();
  }
  async function addAssignment() {
    if (!teamOptions[0] || !userOptions[0]) {
      setError("Cannot add assignment until teams and users are loaded.");
      return;
    }
    const { error: e } = await supabase.from("team_assignments").insert({
      team_id: teamOptions[0].id,
      discord_user_id: userOptions[0].id,
      start_year: Number(currentYear),
      status: "Active",
    });
    if (e) {
      setError(`Assignment add failed: ${e.message}`);
      return;
    }
    setError("");
    await loadData();
  }
  async function addAA() {
    if (!teamOptions[0]) {
      setError("Cannot add All-American until teams are loaded.");
      return;
    }
    const { error: e } = await supabase.from("all_americans").insert({
      season_year: Number(currentYear),
      type: "First-Team",
      player_name: "New Player",
      team_id: teamOptions[0].id,
      position: "QB",
    });
    if (e) {
      setError(`All-American add failed: ${e.message}`);
      return;
    }
    setError("");
    await loadData();
  }
  async function addAward() {
    if (!teamOptions[0]) {
      setError("Cannot add award until teams are loaded.");
      return;
    }
    const { error: e } = await supabase.from("awards").insert({
      season_year: Number(currentYear),
      award_name: AWARD_NAMES[0],
      player_name: "New Player",
      team_id: teamOptions[0].id,
      position: "QB",
    });
    if (e) {
      setError(`Award add failed: ${e.message}`);
      return;
    }
    setError("");
    await loadData();
  }
  async function addHeisman() { if (!teamOptions[0]) return; const { error: e } = await supabase.from("heisman_winners").insert({ season_year: Number(currentYear), player_name: "New Player", team_id: teamOptions[0].id, position: "QB" }); if (e) { setError(`Heisman add failed: ${e.message}`); return; } setError(""); await loadData(); }
  async function addNationalChampion() { if (!teamOptions[0]) return; const { error: e } = await supabase.from("national_champions").insert({ season_year: Number(currentYear), team_id: teamOptions[0].id, discord_user_id: userOptions[0]?.id || null }); if (e) { setError(`National Champion add failed: ${e.message}`); return; } setError(""); await loadData(); }
  async function addRecruiting(teamId) { const { error: e } = await supabase.from("recruiting_classes").insert({ team_id: teamId, season_year: Number(newRecruiting.season_year || currentYear), rank: newRecruiting.rank ? Number(newRecruiting.rank) : null }); if (e) { setError(`Recruiting add failed: ${e.message}`); return; } setError(""); await loadData(); }
  async function addHistory(teamId) { const { error: e } = await supabase.from("team_history_records").insert({ team_id: teamId, season_year: Number(newHistory.season_year || currentYear), record: newHistory.record || "0-0" }); if (e) { setError(`History add failed: ${e.message}`); return; } setNewHistory({ season_year: Number(currentYear), record: "0-0" }); setError(""); await loadData(); }

  return <div style={page}><div style={container}><Header loading={loading} reload={loadData}/>{error && <div style={errorBox}>{error}</div>}<TabBar tabs={tabs} activeTab={activeTab} setActiveTab={setActiveTab}/>
    {activeTab === "dashboard" && <><Stats currentYear={currentYear} setCurrentYear={(value)=>{setCurrentYear(value); setNewResult((prev)=>({...prev, season_year: Number(value)}));}} currentWeek={currentWeek} setCurrentWeek={(value)=>{setCurrentWeek(value); setNewResult((prev)=>({...prev, week: value}));}} teams={activeTeamOptions} assignments={assignments} saveSettings={saveLeagueSettings}/><UserStandings teams={activeTeamOptions} results={currentYearResults} goToTeam={goToTeam} sortState={userSort} setSortState={setUserSort}/><ChampionshipsByUser champions={nationalChampions}/><RecordResult newResult={newResult} setNewResult={setNewResult} teams={activeTeamOptions} users={userOptions} assignments={assignments} submitResult={submitResult}/><Standings rows={orderedStandings.filter((r)=>activeTeamIds.has(r.team_id)).filter((r)=>JSON.stringify(r).toLowerCase().includes(search.standings.toLowerCase()))} search={search.standings} setSearch={(v)=>setSearch({...search,standings:v})} goToTeam={goToTeam} teams={activeTeamOptions} results={currentYearResults} draggedStanding={draggedStanding} setDraggedStanding={setDraggedStanding} reorderStandings={reorderStandings} sortState={commissionerSort} setSortState={setCommissionerSort}/><Results rows={currentYearResults.filter((r)=>JSON.stringify(r).toLowerCase().includes(search.results.toLowerCase()))} deleteResult={(id)=>deleteRow("game_results", id)} search={search.results} setSearch={(v)=>setSearch({...search,results:v})}/></>}
    {activeTab === "prestige" && <PrestigeLeaderboard users={userOptions} teams={teamOptions} activeTeams={activeTeamOptions} assignments={assignments} results={results} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting}/>}
    {activeTab === "recordBook" && <RecordBook users={userOptions} teams={teamOptions} assignments={assignments} results={results} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting}/>}
    {activeTab === "weeklyNews" && <WeeklyNews results={results} teams={teamOptions} currentYear={currentYear} currentWeek={currentWeek}/>}
    {activeTab === "assignments" && <Assignments rows={assignments} teams={teamOptions} users={userOptions} addAssignment={addAssignment} updateRow={updateRow} deleteRow={deleteRow} drafts={draftAssignments} setDrafts={setDraftAssignments} saveDraft={saveDraft} getDraft={getDraft} teamChange={teamChange} setTeamChange={setTeamChange} changeUserTeam={changeUserTeam}/>}    
    {activeTab === "h2h" && <H2H results={results} search={search.h2h} setSearch={(v)=>setSearch({...search,h2h:v})}/>}    
    {activeTab === "allAmericans" && <AllAmericans rows={allAmericans} teams={teamOptions} addRow={addAA} updateRow={updateRow} deleteRow={deleteRow} rankings={rankingRows(teamOptions, allAmericans)} drafts={draftAllAmericans} setDrafts={setDraftAllAmericans} saveDraft={saveDraft} getDraft={getDraft}/>}    
    {activeTab === "awards" && <Awards rows={awards} teams={teamOptions} addRow={addAward} updateRow={updateRow} deleteRow={deleteRow} rankings={rankingRows(teamOptions, awards)} drafts={draftAwards} setDrafts={setDraftAwards} saveDraft={saveDraft} getDraft={getDraft}/>}    
    {activeTab === "heismans" && <Heismans rows={heismans} teams={teamOptions} addRow={addHeisman} updateRow={updateRow} deleteRow={deleteRow} drafts={draftHeismans} setDrafts={setDraftHeismans} saveDraft={saveDraft} getDraft={getDraft}/>}    
    {activeTab === "nationalChampions" && <NationalChampions rows={nationalChampions} teams={teamOptions} users={userOptions} addRow={addNationalChampion} updateRow={updateRow} deleteRow={deleteRow} drafts={draftChampions} setDrafts={setDraftChampions} saveDraft={saveDraft} getDraft={getDraft}/>}        
    {selectedTeam && <TeamPage team={selectedTeam} standings={standings.find((r)=>r.team_id===selectedTeam.id)} results={results.filter((r)=>r.team_1_id===selectedTeam.id||r.team_2_id===selectedTeam.id)} allAmericans={allAmericans.filter((r)=>r.team_id===selectedTeam.id)} awards={awards.filter((r)=>r.team_id===selectedTeam.id)} heismans={heismans.filter((r)=>r.team_id===selectedTeam.id)} recruiting={recruiting.filter((r)=>r.team_id===selectedTeam.id)} historyRows={historyRows.filter((r)=>r.team_id===selectedTeam.id)} teams={activeTeamOptions} assignments={assignments} allResults={currentYearResults} addRecruiting={addRecruiting} addHistory={addHistory} updateRow={updateRow} deleteRow={deleteRow} newRecruiting={newRecruiting} setNewRecruiting={setNewRecruiting} newHistory={newHistory} setNewHistory={setNewHistory}/>}    
  </div></div>;
}

function Header({ loading, reload }) { return <header style={header}><div><h1 style={title}>CFBElite 27 Dashboard</h1><p style={subtitle}>Live Supabase League Management System</p></div><button onClick={reload} style={statusBox}>{loading ? "Loading..." : "LIVE DATABASE"}</button></header>; }
function TabBar({ tabs, activeTab, setActiveTab }) { return <div style={tabScroller}><div style={tabRow}>{tabs.map(([key,label])=><button key={key} onClick={()=>setActiveTab(key)} style={activeTab===key?activeTabStyle:tabStyle}>{label}</button>)}</div></div>; }
function Stats({ currentYear, setCurrentYear, currentWeek, setCurrentWeek, teams, assignments, saveSettings }) {
  const activeCoaches = new Set(
    assignments
      .filter((assignment) => assignment.status === "Active" && assignment.discord_user_id)
      .map((assignment) => assignment.discord_user_id)
  ).size;

  return (
    <div style={statsGrid}>
      <Stat title="Active Coaches" value={`${activeCoaches} / 32`} />
      <div style={statCard}>
        <div style={statTitle}>Current Year</div>
        <select value={currentYear} onChange={(e) => setCurrentYear(e.target.value)} style={statSelect}>
          {YEARS.map((year) => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
      </div>
      <div style={statCard}>
        <div style={statTitle}>Current Week</div>
        <select value={currentWeek} onChange={(e) => setCurrentWeek(e.target.value)} style={statSelect}>
          {WEEKS.map((week) => (
            <option key={week} value={week}>{week}</option>
          ))}
        </select>
      </div>
      <div style={statCard}>
        <div style={statTitle}>League Settings</div>
        <button onClick={saveSettings} style={button}>Save Year / Week</button>
        <p style={mutedText}>Click save after changing year or week so every visitor sees the same setting.</p>
      </div>
    </div>
  );
}

function Stat({ title, value }) { return <div style={statCard}><div style={statTitle}>{title}</div><div style={statValue}>{value}</div></div>; }

function UserStandings({ teams, results, goToTeam, sortState, setSortState }) {
  const baseRows = teams
    .map((team) => {
      const record = recordFromResults(team.id, results);
      return {
        team,
        teamName: team.name,
        wins: record.wins,
        losses: record.losses,
        games: record.games,
        avgPf: Number(record.avgPf),
        avgPa: Number(record.avgPa),
        top25: top25Wins(team.id, results),
        sor: Number(strengthOfResult(team.id, teams, results)),
      };
    })
    .sort((a, b) => compareForSort(a, b, "record", "desc"));

  const rankedRows = baseRows.map((row, index) => ({ ...row, rank: index + 1 }));

  const rows = [...rankedRows].sort((a, b) => compareForSort(a, b, sortState.key, sortState.direction));

  return (
    <section style={card}>
      <h2 style={sectionTitle}>User vs User Standings</h2>
      <Table headers={[
        "#",
        <SortButton label="Team" sortKey="teamName" sortState={sortState} setSortState={setSortState} />,
        <SortButton label="Record" sortKey="record" sortState={sortState} setSortState={setSortState} />,
        <SortButton label="Avg PF" sortKey="avgPf" sortState={sortState} setSortState={setSortState} />,
        <SortButton label="Avg PA" sortKey="avgPa" sortState={sortState} setSortState={setSortState} />,
        <SortButton label="Top 25" sortKey="top25" sortState={sortState} setSortState={setSortState} />,
        <SortButton label="SOR" sortKey="sor" sortState={sortState} setSortState={setSortState} />,
      ]}>
        {rows.map((row, index) => (
          <tr key={row.team.id} style={trStyle}>
            <td style={td}>#{row.rank}</td>
            <td style={clickableTeamCell} onClick={() => goToTeam(row.team.id)}><TeamLabel team={row.team} /></td>
            <td style={td}>{row.wins}-{row.losses}</td>
            <td style={td}>{row.avgPf.toFixed(1)}</td>
            <td style={td}>{row.avgPa.toFixed(1)}</td>
            <td style={td}>{row.top25}</td>
            <td style={td}>{row.sor.toFixed(1)}</td>
          </tr>
        ))}
      </Table>
    </section>
  );
}

function ChampionshipsByUser({ champions }) {
  const rows = championshipRowsByDiscord(champions);

  return (
    <section style={card}>
      <h2 style={sectionTitle}>National Championships by Discord User</h2>
      <Table headers={["#", "Discord User", "Championships", "Teams / Years"]}>
        {rows.length ? rows.map((row, index) => (
          <tr key={row.discord} style={trStyle}>
            <td style={td}>#{index + 1}</td>
            <td style={teamCell}>{row.discord}</td>
            <td style={td}>{row.total}</td>
            <td style={td}>{row.teams.join(", ")}</td>
          </tr>
        )) : (
          <tr style={trStyle}>
            <td style={td}>—</td>
            <td style={td}>No national champions recorded yet.</td>
            <td style={td}>0</td>
            <td style={td}>—</td>
          </tr>
        )}
      </Table>
    </section>
  );
}

function RecordResult({ newResult, setNewResult, teams, users, assignments, submitResult }) {
  const getActiveUserIdForTeam = (teamId) => {
    return assignments.find((assignment) => assignment.team_id === teamId && assignment.status === "Active")?.discord_user_id || "";
  };

  function handleTeamChange(teamKey, userKey, teamId) {
    setNewResult({
      ...newResult,
      [teamKey]: teamId,
      [userKey]: getActiveUserIdForTeam(teamId),
    });
  }

  return (
    <section style={card}>
      <h2 style={sectionTitle}>Record User vs User Result</h2>
      <p style={mutedText}>Year and week are locked to the saved league settings above. Discord users auto-fill from active team assignments.</p>

      <div style={formGrid}>
        <input value={newResult.season_year} disabled title="Controlled by Current Year" style={{ ...input, opacity: 0.7, cursor: "not-allowed" }} />

        <select value={newResult.week} disabled title="Controlled by Current Week" style={{ ...input, opacity: 0.7, cursor: "not-allowed" }}>
          {WEEKS.map((w) => <option key={w}>{w}</option>)}
        </select>

        <select value={newResult.team_1_id} onChange={(e) => handleTeamChange("team_1_id", "team_1_user_id", e.target.value)} style={input}>
          <option value="">Team 1</option>
          {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>

        <select value={newResult.team_1_user_id} onChange={(e) => setNewResult({ ...newResult, team_1_user_id: e.target.value })} style={input}>
          <option value="">Team 1 Discord</option>
          {users.map((user) => <option key={user.id} value={user.id}>{user.discord_username}</option>)}
        </select>

        <input placeholder="Team 1 Rank" value={newResult.team_1_rank} onChange={(e) => setNewResult({ ...newResult, team_1_rank: e.target.value })} style={input} />
        <input placeholder="Team 1 Score" value={newResult.team_1_score} onChange={(e) => setNewResult({ ...newResult, team_1_score: e.target.value })} style={input} />

        <select value={newResult.team_2_id} onChange={(e) => handleTeamChange("team_2_id", "team_2_user_id", e.target.value)} style={input}>
          <option value="">Team 2</option>
          {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>

        <select value={newResult.team_2_user_id} onChange={(e) => setNewResult({ ...newResult, team_2_user_id: e.target.value })} style={input}>
          <option value="">Team 2 Discord</option>
          {users.map((user) => <option key={user.id} value={user.id}>{user.discord_username}</option>)}
        </select>

        <input placeholder="Team 2 Rank" value={newResult.team_2_rank} onChange={(e) => setNewResult({ ...newResult, team_2_rank: e.target.value })} style={input} />
        <input placeholder="Team 2 Score" value={newResult.team_2_score} onChange={(e) => setNewResult({ ...newResult, team_2_score: e.target.value })} style={input} />
        <input placeholder="Tags" value={newResult.tags} onChange={(e) => setNewResult({ ...newResult, tags: e.target.value })} style={input} />
        <button onClick={submitResult} style={button}>Record Result</button>
      </div>
    </section>
  );
}

function SearchBox({ value, onChange }) { return <input value={value} onChange={(e)=>onChange(e.target.value)} placeholder="Search..." style={searchInput}/>; }
function Standings({ rows, search, setSearch, goToTeam, teams, results, draggedStanding, setDraggedStanding, reorderStandings, sortState, setSortState }) {
  const computedRows = rows
    .map((row, originalIndex) => {
      const team = teams.find((item) => item.id === row.team_id);
      const teamId = row.team_id;
      const record = recordFromResults(teamId, results);
      const bowl = bowlRecord(teamId, results);
      return {
        ...row,
        originalIndex,
        team,
        teamName: row.team_name || team?.name || "",
        wins: record.wins,
        losses: record.losses,
        games: record.games,
        avgPf: Number(record.avgPf),
        avgPa: Number(record.avgPa),
        top25: top25Wins(teamId, results),
        conf: titleCount(teamId, results, "Conference Championship Week"),
        nattys: titleCount(teamId, results, "National Championship Week"),
        bowlText: `${bowl.wins}-${bowl.losses}`,
        bowlScore: bowl.wins - bowl.losses,
        sor: Number(strengthOfResult(teamId, teams, results)),
        rank: originalIndex + 1,
      };
    })
    .sort((a, b) => {
      if (sortState.key === "manual") return a.originalIndex - b.originalIndex;
      return compareForSort(a, b, sortState.key, sortState.direction);
    });

  return (
    <section style={card}>
      <div style={sectionTop}>
        <div>
          <h2 style={sectionTitle}>Commissioner League Standings</h2>
          <p style={mutedText}>Click a column header to sort greatest/least. Drag teams to save the official commissioner order for everyone.</p>
        </div>
        <SearchBox value={search} onChange={setSearch} />
      </div>
      <Table headers={[
        "Move",
        "#",
        <SortButton label="Team" sortKey="teamName" sortState={sortState} setSortState={setSortState} />,
        <SortButton label="W" sortKey="wins" sortState={sortState} setSortState={setSortState} />,
        <SortButton label="L" sortKey="losses" sortState={sortState} setSortState={setSortState} />,
        <SortButton label="Avg PF" sortKey="avgPf" sortState={sortState} setSortState={setSortState} />,
        <SortButton label="Avg PA" sortKey="avgPa" sortState={sortState} setSortState={setSortState} />,
        <SortButton label="Top 25" sortKey="top25" sortState={sortState} setSortState={setSortState} />,
        <SortButton label="Conf" sortKey="conf" sortState={sortState} setSortState={setSortState} />,
        <SortButton label="Nattys" sortKey="nattys" sortState={sortState} setSortState={setSortState} />,
        <SortButton label="Bowl" sortKey="bowlScore" sortState={sortState} setSortState={setSortState} />,
        <SortButton label="SOR" sortKey="sor" sortState={sortState} setSortState={setSortState} />,
      ]}>
        {computedRows.map((row, index) => (
          <tr key={row.team_id} style={trStyle} draggable onDragStart={() => setDraggedStanding(row.team_id)} onDragOver={(e) => e.preventDefault()} onDrop={() => reorderStandings(row.team_id)}>
            <td style={td}>☰</td>
            <td style={td}>#{row.rank}</td>
            <td style={clickableTeamCell} onClick={() => goToTeam(row.team_id)}><TeamLabel team={row.team} name={row.teamName} /></td>
            <td style={td}>{row.wins}</td>
            <td style={td}>{row.losses}</td>
            <td style={td}>{row.avgPf.toFixed(1)}</td>
            <td style={td}>{row.avgPa.toFixed(1)}</td>
            <td style={td}>{row.top25}</td>
            <td style={td}>{row.conf}</td>
            <td style={td}>{row.nattys}</td>
            <td style={td}>{row.bowlText}</td>
            <td style={td}>{row.sor.toFixed(1)}</td>
          </tr>
        ))}
      </Table>
    </section>
  );
}

function Results({ rows, deleteResult, search, setSearch }) {
  return (
    <section style={card}>
      <div style={sectionTop}>
        <h2 style={sectionTitle}>User vs User Results</h2>
        <SearchBox value={search} onChange={setSearch} />
      </div>
      <Table headers={["Year", "Week", "Team 1", "User 1", "Score", "Team 2", "User 2", "Tags", ""]}>
        {rows.map((row) => (
          <tr key={row.id} style={trStyle}>
            <td style={td}>{row.season_year}</td>
            <td style={td}>{row.week}</td>
            <td style={teamCell}><TeamLabel team={row.team_1} /></td>
            <td style={td}>{row.user_1?.discord_username || "—"}</td>
            <td style={td}>{row.team_1_score}-{row.team_2_score}</td>
            <td style={teamCell}><TeamLabel team={row.team_2} /></td>
            <td style={td}>{row.user_2?.discord_username || "—"}</td>
            <td style={td}>{row.tags?.join(", ") || "—"}</td>
            <td style={td}><DeleteButton onClick={() => deleteResult(row.id)} /></td>
          </tr>
        ))}
      </Table>
    </section>
  );
}


function PrestigeLeaderboard({ users, teams, activeTeams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting }) {
  const rows = getCoachStats(users, teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting)
    .filter((row) => row.activeTeams.length || row.games || row.nattys || row.awards || row.allAmericans || row.heismans);

  return (
    <section style={card}>
      <div style={sectionTop}>
        <div>
          <h2 style={sectionTitle}>Program Prestige by Discord User</h2>
          <p style={mutedText}>Automated all-time coach prestige. Follows Discord users across team changes and updates from results, titles, awards, All-Americans, Heismans, and recruiting.</p>
        </div>
      </div>
      <Table headers={["#", "Discord User", "Prestige", "Record", "Nattys", "Conf", "Top 25", "Awards", "AA", "Heisman", "Active Team", "Teams Coached"]}>
        {rows.map((row, index) => (
          <tr key={row.userId || row.discord} style={trStyle}>
            <td style={td}>#{index + 1}</td>
            <td style={teamCell}>{row.discord}</td>
            <td style={td}>{row.prestige.toFixed(1)}</td>
            <td style={td}>{row.wins}-{row.losses}</td>
            <td style={td}>{row.nattys}</td>
            <td style={td}>{row.confTitles}</td>
            <td style={td}>{row.top25Wins}</td>
            <td style={td}>{row.awards}</td>
            <td style={td}>{row.allAmericans}</td>
            <td style={td}>{row.heismans}</td>
            <td style={td}>{row.activeTeamsText}</td>
            <td style={td}>{row.teamsCoachedText}</td>
          </tr>
        ))}
      </Table>
    </section>
  );
}

function RecordBook({ users, teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting }) {
  const rows = recordBookRows(users, teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting);

  return (
    <section style={card}>
      <h2 style={sectionTitle}>Automated Record Book</h2>
      <p style={mutedText}>Fully automated from recorded games, team assignments, awards, All-Americans, Heismans, national champions, and recruiting ranks.</p>
      <Table headers={["Record", "Holder", "Value"]}>
        {rows.map((row) => (
          <tr key={row.record} style={trStyle}>
            <td style={teamCell}>{row.record}</td>
            <td style={td}>{row.holder}</td>
            <td style={td}>{row.value}</td>
          </tr>
        ))}
      </Table>
    </section>
  );
}

function WeeklyNews({ results, teams, currentYear, currentWeek }) {
  const items = weeklyNewsItems(results, teams, currentYear, currentWeek);

  return (
    <section style={card}>
      <h2 style={sectionTitle}>Automated Weekly News</h2>
      <p style={mutedText}>Generated from the results table. No manual writing required.</p>
      <div style={miniCard}>
        <h3>{currentYear} — {currentWeek}</h3>
        {items.map((item, index) => (
          <div key={index} style={miniRow}>{item}</div>
        ))}
      </div>
    </section>
  );
}

function Assignments({ rows, teams, users, addAssignment, updateRow, deleteRow, drafts, setDrafts, saveDraft, getDraft, teamChange, setTeamChange, changeUserTeam }) {
  return <section style={card}>
    <div style={sectionTop}><h2 style={sectionTitle}>Users / Team Assignments</h2><button onClick={addAssignment} style={button}>Add Assignment</button></div>
    <div style={miniCard}>
      <h3>Change User Team</h3>
      <p style={mutedText}>This marks the user's current active team as Former and creates a new Active assignment, preserving history.</p>
      <div style={formGrid}>
        <select value={teamChange.discord_user_id} onChange={(e)=>setTeamChange({...teamChange,discord_user_id:e.target.value})} style={input}><option value="">Select Discord User</option>{users.map((u)=><option key={u.id} value={u.id}>{u.discord_username}</option>)}</select>
        <select value={teamChange.new_team_id} onChange={(e)=>setTeamChange({...teamChange,new_team_id:e.target.value})} style={input}><option value="">Select New Team</option>{teams.map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <input value={teamChange.start_year} onChange={(e)=>setTeamChange({...teamChange,start_year:e.target.value})} placeholder="Start Year" style={input}/>
        <button onClick={changeUserTeam} style={button}>Change Team</button>
      </div>
    </div>
    <Table headers={["Team","Discord User","Status","Start","End","Save",""]}>{rows.map((r)=>{const d=getDraft(drafts,r);return <tr key={r.id} style={trStyle}>
      <td style={td}><select value={d.team_id} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),team_id:e.target.value}})} style={input}>{teams.map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></td>
      <td style={td}><select value={d.discord_user_id} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),discord_user_id:e.target.value}})} style={input}>{users.map((u)=><option key={u.id} value={u.id}>{u.discord_username}</option>)}</select></td>
      <td style={td}><select value={d.status} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),status:e.target.value}})} style={input}><option>Active</option><option>Former</option></select></td>
      <td style={td}><input value={d.start_year} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),start_year:e.target.value}})} style={input}/></td>
      <td style={td}><input value={d.end_year||""} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),end_year:e.target.value}})} style={input}/></td>
      <td style={td}><button onClick={()=>saveDraft("team_assignments",r.id,drafts[r.id], ["start_year","end_year"])} style={button}>Save</button></td>
      <td style={td}><DeleteButton onClick={()=>deleteRow("team_assignments",r.id)}/></td>
    </tr>})}</Table>
  </section>;
}
function H2H({ results, search, setSearch }) { const map=new Map(); results.forEach((r)=>{const u1=r.user_1?.discord_username;const u2=r.user_2?.discord_username;if(!u1||!u2)return;const t1Win=r.team_1_score>r.team_2_score;[[u1,u2,t1Win],[u2,u1,!t1Win]].forEach(([u,o,w])=>{const k=`${u}-${o}`;if(!map.has(k))map.set(k,{user:u,opp:o,w:0,l:0});if(w)map.get(k).w++;else map.get(k).l++;});}); const rows=[...map.values()].filter((r)=>JSON.stringify(r).toLowerCase().includes(search.toLowerCase())).sort((a,b)=>a.user.localeCompare(b.user)||a.opp.localeCompare(b.opp)); return <section style={card}><div style={sectionTop}><div><h2 style={sectionTitle}>User vs User H2H</h2><p style={mutedText}>All-time across every recorded season.</p></div><SearchBox value={search} onChange={setSearch}/></div><Table headers={["User","Opponent","W","L","Record"]}>{rows.map((r)=><tr key={`${r.user}-${r.opp}`} style={trStyle}><td style={teamCell}>{r.user}</td><td style={td}>{r.opp}</td><td style={td}>{r.w}</td><td style={td}>{r.l}</td><td style={td}>{r.w}-{r.l}</td></tr>)}</Table></section>; }
function Rankings({ title, rows }) { return <div style={miniCard}><h3>{title}</h3>{rows.map((r,i)=><div key={r.team} style={miniRow}>#{i+1} {r.team}: <b>{r.total}</b></div>)}</div>; }
function AllAmericans({ rows, teams, addRow, updateRow, deleteRow, rankings, drafts, setDrafts, saveDraft, getDraft }) {
  return <section style={card}><div style={sectionTop}><h2 style={sectionTitle}>All-Americans</h2><button onClick={addRow} style={button}>Add</button></div><div style={twoColWide}><div><Table headers={["Type","Player","Team","Position","Year","Save",""]}>{rows.map((r)=>{const d=getDraft(drafts,r);return <tr key={r.id} style={trStyle}>
    <td style={td}><select value={d.type} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),type:e.target.value}})} style={input}>{ALL_AMERICAN_TYPES.map((x)=><option key={x}>{x}</option>)}</select></td>
    <td style={td}><input value={d.player_name} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),player_name:e.target.value}})} style={input}/></td>
    <td style={td}><select value={d.team_id} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),team_id:e.target.value}})} style={input}>{teams.map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></td>
    <td style={td}><select value={d.position} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),position:e.target.value}})} style={input}>{POSITIONS.map((p)=><option key={p}>{p}</option>)}</select></td>
    <td style={td}><select value={String(d.season_year)} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),season_year:e.target.value}})} style={input}>{YEARS.map((y)=><option key={y}>{y}</option>)}</select></td>
    <td style={td}><button onClick={()=>saveDraft("all_americans",r.id,drafts[r.id], ["season_year"])} style={button}>Save</button></td>
    <td style={td}><DeleteButton onClick={()=>deleteRow("all_americans",r.id)}/></td>
  </tr>})}</Table></div><Rankings title="All-American Rankings" rows={rankings}/></div></section>;
}
function Awards({ rows, teams, addRow, updateRow, deleteRow, rankings, drafts, setDrafts, saveDraft, getDraft }) {
  return <section style={card}><div style={sectionTop}><h2 style={sectionTitle}>Awards</h2><button onClick={addRow} style={button}>Add</button></div><div style={twoColWide}><div><Table headers={["Award","Team","Player","Position","Year","Save",""]}>{rows.map((r)=>{const d=getDraft(drafts,r);return <tr key={r.id} style={trStyle}>
    <td style={td}><select value={d.award_name} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),award_name:e.target.value}})} style={input}>{AWARD_NAMES.map((a)=><option key={a}>{a}</option>)}</select></td>
    <td style={td}><select value={d.team_id} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),team_id:e.target.value}})} style={input}>{teams.map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></td>
    <td style={td}><input value={d.player_name} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),player_name:e.target.value}})} style={input}/></td>
    <td style={td}><select value={d.position} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),position:e.target.value}})} style={input}>{POSITIONS.map((p)=><option key={p}>{p}</option>)}</select></td>
    <td style={td}><select value={String(d.season_year)} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),season_year:e.target.value}})} style={input}>{YEARS.map((y)=><option key={y}>{y}</option>)}</select></td>
    <td style={td}><button onClick={()=>saveDraft("awards",r.id,drafts[r.id], ["season_year"])} style={button}>Save</button></td>
    <td style={td}><DeleteButton onClick={()=>deleteRow("awards",r.id)}/></td>
  </tr>})}</Table></div><Rankings title="Awards Rankings" rows={rankings}/></div></section>;
}
function Heismans({ rows, teams, addRow, updateRow, deleteRow, drafts, setDrafts, saveDraft, getDraft }) {
  return <section style={card}><div style={sectionTop}><h2 style={sectionTitle}>Heisman Winners</h2><button onClick={addRow} style={button}>Add</button></div><Table headers={["Player","Team","Position","Year","Save",""]}>{rows.map((r)=>{const d=getDraft(drafts,r);return <tr key={r.id} style={trStyle}>
    <td style={td}><input value={d.player_name} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),player_name:e.target.value}})} style={input}/></td>
    <td style={td}><select value={d.team_id} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),team_id:e.target.value}})} style={input}>{teams.map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></td>
    <td style={td}><select value={d.position} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),position:e.target.value}})} style={input}>{POSITIONS.map((p)=><option key={p}>{p}</option>)}</select></td>
    <td style={td}><select value={String(d.season_year)} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),season_year:e.target.value}})} style={input}>{YEARS.map((y)=><option key={y}>{y}</option>)}</select></td>
    <td style={td}><button onClick={()=>saveDraft("heisman_winners",r.id,drafts[r.id], ["season_year"])} style={button}>Save</button></td>
    <td style={td}><DeleteButton onClick={()=>deleteRow("heisman_winners",r.id)}/></td>
  </tr>})}</Table></section>;
}
function NationalChampions({ rows, teams, users, addRow, updateRow, deleteRow, drafts, setDrafts, saveDraft, getDraft }) {
  return <section style={card}><div style={sectionTop}><h2 style={sectionTitle}>National Champions</h2><button onClick={addRow} style={button}>Add</button></div><Table headers={["Team","Discord User","Year","Save",""]}>{rows.map((r)=>{const d=getDraft(drafts,r);return <tr key={r.id} style={trStyle}>
    <td style={td}><select value={d.team_id} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),team_id:e.target.value}})} style={input}>{teams.map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></td>
    <td style={td}><select value={d.discord_user_id || ""} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),discord_user_id:e.target.value}})} style={input}><option value="">Select Discord User</option>{users.map((u)=><option key={u.id} value={u.id}>{u.discord_username}</option>)}</select></td>
    <td style={td}><select value={String(d.season_year)} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),season_year:e.target.value}})} style={input}>{YEARS.map((y)=><option key={y}>{y}</option>)}</select></td>
    <td style={td}><button onClick={()=>saveDraft("national_champions",r.id,drafts[r.id], ["season_year"])} style={button}>Save</button></td>
    <td style={td}><DeleteButton onClick={()=>deleteRow("national_champions",r.id)}/></td>
  </tr>})}</Table></section>;
}
function DraftOrder({ rows, users, updateRow, drafts, setDrafts, saveDraft, getDraft }) { return <section style={card}><h2 style={sectionTitle}>CFBElite 27 Draft Order</h2><Table headers={["Pick","Team Name","Discord User","Save"]}>{rows.map((r)=>{const d=getDraft(drafts,r);return <tr key={r.id} style={trStyle}><td style={teamCell}>#{r.pick_number}</td><td style={td}><input value={d.team_name||""} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),team_name:e.target.value}})} style={input}/></td><td style={td}><select value={d.discord_user_id||""} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),discord_user_id:e.target.value}})} style={input}><option value="">Select User</option>{users.map((u)=><option key={u.id} value={u.id}>{u.discord_username}</option>)}</select></td><td style={td}><button onClick={()=>saveDraft("draft_order_27",r.id,drafts[r.id])} style={button}>Save</button></td></tr>})}</Table></section>; }
function Playoff({ rows, teams, updateRow, drafts, setDrafts, saveDraft, getDraft }) { return <section style={card}><h2 style={sectionTitle}>College Football Playoff Bracket</h2><div style={bracketGrid}>{["First Round","Quarterfinals","Semifinals","National Championship"].map((round)=><div key={round}><h3>{round}</h3>{rows.filter((g)=>g.round===round).map((g)=>{const d=getDraft(drafts,g);return <div key={g.id} style={gameCard}><input value={d.bowl_name||""} onChange={(e)=>setDrafts({...drafts,[g.id]:{...(drafts[g.id]||{}),bowl_name:e.target.value}})} placeholder="Bowl" style={input}/><input value={d.top_seed||""} onChange={(e)=>setDrafts({...drafts,[g.id]:{...(drafts[g.id]||{}),top_seed:e.target.value}})} placeholder="Top Seed" style={input}/><select value={d.top_team_id||""} onChange={(e)=>setDrafts({...drafts,[g.id]:{...(drafts[g.id]||{}),top_team_id:e.target.value}})} style={input}><option value="">Top Team</option>{teams.map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select><b style={{textAlign:"center"}}>VS</b><input value={d.bottom_seed||""} onChange={(e)=>setDrafts({...drafts,[g.id]:{...(drafts[g.id]||{}),bottom_seed:e.target.value}})} placeholder="Bottom Seed" style={input}/><select value={d.bottom_team_id||""} onChange={(e)=>setDrafts({...drafts,[g.id]:{...(drafts[g.id]||{}),bottom_team_id:e.target.value}})} style={input}><option value="">Bottom Team</option>{teams.map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select><input value={d.score||""} onChange={(e)=>setDrafts({...drafts,[g.id]:{...(drafts[g.id]||{}),score:e.target.value}})} placeholder="Score" style={input}/><button onClick={()=>saveDraft("playoff_games",g.id,drafts[g.id])} style={button}>Save Game</button></div>})}</div>)}</div></section>; }
function TeamPage({ team, standings, results, allResults, teams, assignments, allAmericans, awards, heismans, recruiting, historyRows, addRecruiting, addHistory, updateRow, deleteRow, newRecruiting, setNewRecruiting, newHistory, setNewHistory }) {
  const stat = standings || {};
  const rec = recordFromResults(team.id, results);
  const bowl = bowlRecord(team.id, results);
  const activeCoach = activeCoachForTeam(team.id, assignments);
  const coachName = activeCoach?.discord_users?.discord_username || "Unassigned";

  return <section style={card}><h2 style={sectionTitle}><TeamLabel team={team} /></h2><div style={coachBanner}><div><div style={statTitle}>Current Discord User / Coach</div><div style={coachNameStyle}>{coachName}</div></div><div><div style={statTitle}>Program Page</div><div style={mutedText}>Team history and coach profile combined.</div></div></div><div style={statsGrid}><Stat title="Overall" value={`${stat.wins??0}-${stat.losses??0}`}/><Stat title="Avg PF" value={rec.avgPf}/><Stat title="Avg PA" value={rec.avgPa}/><Stat title="Top 25" value={top25Wins(team.id, results)}/><Stat title="Top 25 Class" value={recruiting.filter((r)=>Number(r.rank) >= 1 && Number(r.rank) <= 25).length}/><Stat title="Awards" value={awards.length}/><Stat title="All-Americans" value={allAmericans.length}/><Stat title="Heismans" value={heismans.length}/><Stat title="Conf Titles" value={titleCount(team.id, results, "Conference Championship Week")}/><Stat title="Nattys" value={titleCount(team.id, results, "National Championship Week")}/><Stat title="Bowl" value={`${bowl.wins}-${bowl.losses}`}/><Stat title="SOR" value={strengthOfResult(team.id, teams, allResults)}/></div><div style={twoCol}><div style={miniCard}><h3>Recruiting Rankings</h3><div style={formGrid}><input placeholder="Year" value={newRecruiting.season_year} onChange={(e)=>setNewRecruiting({...newRecruiting,season_year:e.target.value})} style={input}/><input placeholder="Rank" value={newRecruiting.rank} onChange={(e)=>setNewRecruiting({...newRecruiting,rank:e.target.value})} style={input}/><button onClick={()=>addRecruiting(team.id)} style={button}>Add</button></div>{recruiting.map((r)=><div key={r.id} style={miniRow}>{r.season_year}: #{r.rank} <DeleteButton onClick={()=>deleteRow("recruiting_classes",r.id)}/></div>)}</div><div style={miniCard}><h3>History</h3><div style={formGrid}><input placeholder="Year" value={newHistory.season_year} onChange={(e)=>setNewHistory({...newHistory,season_year:e.target.value})} style={input}/><input placeholder="Record" value={newHistory.record} onChange={(e)=>setNewHistory({...newHistory,record:e.target.value})} style={input}/><button onClick={()=>addHistory(team.id)} style={button}>Add</button></div>{historyRows.map((r)=><div key={r.id} style={miniRow}><input value={r.season_year} onChange={(e)=>updateRow("team_history_records",r.id,"season_year",Number(e.target.value))} style={smallInput}/><input value={r.record || ""} onChange={(e)=>updateRow("team_history_records",r.id,"record",e.target.value)} style={smallInput}/><DeleteButton onClick={()=>deleteRow("team_history_records",r.id)}/></div>)}</div></div><Results rows={results} deleteResult={()=>{}} search="" setSearch={()=>{}}/><div style={twoCol}><MiniList title="All-Americans" rows={allAmericans.map((r)=>`${r.player_name} — ${r.type}, ${r.position}, ${r.season_year}`)}/><MiniList title="Awards" rows={awards.map((r)=>`${r.player_name} — ${r.award_name}, ${r.position}, ${r.season_year}`)}/><MiniList title="Heisman Winners" rows={heismans.map((r)=>`${r.player_name} — ${r.position}, ${r.season_year}`)}/></div></section>;
}
function MiniList({ title, rows }) { return <div style={miniCard}><h3>{title}</h3>{rows.map((r,i)=><div key={i} style={miniRow}>{r}</div>)}</div>; }
function Table({ headers, children }) { return <div style={{overflowX:"auto",marginTop:20}}><table style={table}><thead><tr>{headers.map((h, index)=><th key={typeof h === "string" ? h : index} style={th}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
function DeleteButton({ onClick }) { return <button onClick={onClick} style={deleteButton}>Delete</button>; }

const page={minHeight:"100vh",width:"100%",background:"#09090b",color:"white",overflowX:"hidden"};
const container={width:"100%",maxWidth:"none",margin:0,padding:24,boxSizing:"border-box"};
const header={display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24,flexWrap:"wrap",gap:20};
const title={fontSize:52,fontWeight:900,margin:0,color:"white"};
const subtitle={marginTop:8,color:"#a1a1aa",fontSize:16};
const statusBox={background:"#991b1b",border:"1px solid #dc2626",padding:"12px 20px",borderRadius:14,fontWeight:700,color:"white",cursor:"pointer"};
const tabScroller={overflowX:"auto",background:"#111113",border:"1px solid #27272a",borderRadius:20,padding:10,marginBottom:24};
const tabRow={display:"flex",gap:8,width:"max-content"};
const tabStyle={background:"#18181b",color:"white",border:"1px solid #3f3f46",borderRadius:14,padding:"10px 14px",fontWeight:700,cursor:"pointer"};
const activeTabStyle={...tabStyle,background:"#dc2626",border:"1px solid #ef4444"};
const statsGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:20,marginBottom:32};
const statCard={background:"#18181b",border:"1px solid #27272a",borderRadius:22,padding:24};
const statTitle={color:"#a1a1aa",fontSize:14,marginBottom:10,textTransform:"uppercase"};
const statValue={fontSize:38,fontWeight:900,color:"white"};
const statInput={...statValue,background:"transparent",color:"white",border:"none",outline:"none",width:"100%"};
const statSelect={background:"#27272a",color:"white",border:"1px solid #3f3f46",borderRadius:12,padding:14,fontSize:24,fontWeight:900,width:"100%"};
const card={background:"#18181b",border:"1px solid #27272a",borderRadius:24,padding:24,marginBottom:32};
const sectionTop={display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,flexWrap:"wrap"};
const sectionTitle={fontSize:30,fontWeight:900,margin:0,color:"white"};
const formGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:16,marginTop:20};
const input={background:"#27272a",border:"1px solid #3f3f46",color:"white",padding:14,borderRadius:12,fontSize:15,width:"100%",boxSizing:"border-box"};
const smallInput={...input,width:"120px",marginRight:8};
const searchInput={...input,maxWidth:320};
const button={background:"#dc2626",color:"white",border:"none",borderRadius:12,padding:14,fontWeight:700,cursor:"pointer"};
const sortButton={background:"transparent",border:"none",color:"#a1a1aa",fontSize:13,textTransform:"uppercase",fontWeight:800,cursor:"pointer",padding:0};
const deleteButton={background:"#7f1d1d",color:"white",border:"1px solid #dc2626",borderRadius:10,padding:"8px 10px",cursor:"pointer"};
const table={width:"100%",borderCollapse:"collapse",minWidth:820};
const th={textAlign:"left",padding:"14px 10px",color:"#a1a1aa",fontSize:13,textTransform:"uppercase",borderBottom:"1px solid #27272a"};
const trStyle={borderBottom:"1px solid #27272a"};
const td={padding:"16px 10px",color:"white"};
const teamCell={...td,color:"#f87171",fontWeight:700};
const clickableTeamCell={...teamCell,cursor:"pointer",textDecoration:"underline"};
const mutedText={color:"#a1a1aa",marginTop:8,marginBottom:0};
const errorBox={background:"#7f1d1d",border:"1px solid #dc2626",color:"white",padding:"14px 18px",borderRadius:14,marginBottom:20};
const bracketGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(260px, 1fr))",gap:16,marginTop:20};
const gameCard={display:"grid",gap:10,border:"1px solid #3f3f46",borderRadius:16,padding:14,background:"#111113",marginBottom:14};
const twoCol={display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(320px, 1fr))",gap:20,marginTop:24};
const twoColWide={display:"grid",gridTemplateColumns:"minmax(0, 3fr) minmax(280px, 1fr)",gap:20,marginTop:20};
const miniCard={background:"#111113",border:"1px solid #27272a",borderRadius:18,padding:18};
const miniRow={borderBottom:"1px solid #27272a",padding:"10px 0",color:"#e4e4e7"};

const teamLabel={display:"inline-flex",alignItems:"center",gap:10};
const helmetIcon={width:28,height:28,objectFit:"contain",borderRadius:6,background:"#27272a"};
const helmetFallback={fontSize:22,lineHeight:1};

const coachBanner={display:"flex",justifyContent:"space-between",gap:20,alignItems:"center",background:"#111113",border:"1px solid #27272a",borderRadius:18,padding:18,margin:"18px 0 24px",flexWrap:"wrap"};
const coachNameStyle={fontSize:28,fontWeight:900,color:"#f87171"};
