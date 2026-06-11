import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const WEEKS = ["Week 1","Week 2","Week 3","Week 4","Week 5","Week 6","Week 7","Week 8","Week 9","Week 10","Week 11","Week 12","Week 13","Week 14","Conference Championship Week","Bowl Week 1","Bowl Week 2","Bowl Week 3","National Championship Week"];
function weekIndex(week) { const index = WEEKS.indexOf(week); return index === -1 ? 999 : index; }
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
  const teamRows = teams.map((team) => {
    const rec = recordFromResults(team.id, results);
    return {
      label: team.name,
      wins: rec.wins,
      games: rec.games,
      avgPf: Number(rec.avgPf),
      top25: top25Wins(team.id, results),
      conf: titleCount(team.id, results, "Conference Championship Week"),
      nattys: titleCount(team.id, results, "National Championship Week"),
      sor: Number(strengthOfResult(team.id, teams, results)) || 0,
    };
  });

  const best = (rows, key, label, formatter = (value) => value) => {
    const row = [...rows].sort((a, b) => Number(b[key] || 0) - Number(a[key] || 0))[0];
    return { record: label, holder: row?.discord || row?.label || "—", value: row ? formatter(row[key], row) : "—" };
  };

  return [
    best(coachRows, "wins", "All-time most wins by Discord user"),
    best(coachRows, "nattys", "Most national titles"),
    best(coachRows, "confTitles", "Most conference titles"),
    best(coachRows, "top25Wins", "Most Top 25 wins"),
    best(coachRows, "heismans", "Most Heisman winners"),
    best(teamRows, "avgPf", "Highest Avg PF", (value) => Number(value).toFixed(1)),
    best(teamRows, "top25", "Most Top 25 wins", (value) => Number(value)),
  ];
}

function weeklyNewsItems(results, teams, currentYear, currentWeek) {
  const yearResults = results.filter((row) => String(row.season_year) === String(currentYear));
  if (!yearResults.length) return [`No ${currentYear} results have been recorded yet. Once results are entered, this page will automatically generate storylines.`];

  const currentWeekResults = yearResults.filter((row) => row.week === currentWeek);
  const source = currentWeekResults.length ? currentWeekResults : yearResults;
  const seen = new Set();
  const uniqueGames = source.filter((game) => {
    const key = game.id || `${game.season_year}-${game.week}-${game.team_1_id}-${game.team_2_id}-${game.team_1_score}-${game.team_2_score}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);

  const stories = uniqueGames.map((game) => {
    const team1 = game.team_1?.name || teamNameById(game.team_1_id, teams);
    const team2 = game.team_2?.name || teamNameById(game.team_2_id, teams);
    const s1 = Number(game.team_1_score || 0);
    const s2 = Number(game.team_2_score || 0);
    const team1Won = s1 >= s2;
    const winner = team1Won ? team1 : team2;
    const loser = team1Won ? team2 : team1;
    const winScore = Math.max(s1, s2);
    const loseScore = Math.min(s1, s2);
    const rankedLoser = team1Won ? game.team_2_rank : game.team_1_rank;
    const rankedText = Number(rankedLoser) >= 1 && Number(rankedLoser) <= 25 ? ` over ranked #${rankedLoser} ${loser}` : ` over ${loser}`;
    return `${game.week}: ${winner} defeated${rankedText}, ${winScore}-${loseScore}.`;
  });

  return [
    currentWeekResults.length
      ? `${currentWeekResults.length} result${currentWeekResults.length === 1 ? "" : "s"} recorded for ${currentYear} ${currentWeek}.`
      : `No results are recorded for ${currentYear} ${currentWeek} yet. Showing latest ${currentYear} storylines instead.`,
    ...stories,
  ];
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
  const [tabOrder, setTabOrder] = useState([]);
  const [draggedTab, setDraggedTab] = useState(null);
  const [userSort, setUserSort] = useState({ key: "score", direction: "desc" });
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
  const activeCoachUsers = useMemo(() => {
    const activeUserIds = new Set(assignments.filter((assignment) => assignment.status === "Active" && assignment.discord_user_id).map((assignment) => assignment.discord_user_id));
    return userOptions.filter((user) => activeUserIds.has(user.id));
  }, [assignments, userOptions]);
  const selectedCoach = activeTab.startsWith("coach-") ? users.find((user) => `coach-${user.id}` === activeTab) : null;
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

  const baseTabs = [["dashboard","Dashboard"],["allTimeStandings","All-Time User Standings"],["coachHOF","Coach Hall of Fame"],["playerHOF","Player Hall of Fame"],["assignments","Users/Team Assignments"],["h2h","User vs User H2H"],["allAmericans","All-Americans"],["awards","Awards"],["heismans","Heisman Winners"],["nationalChampions","National Champions"],...activeCoachUsers.map((user) => [`coach-${user.id}`, user.discord_username])];
  const tabs = useMemo(() => {
    const tabMap = new Map(baseTabs);
    const ordered = tabOrder
      .map((key) => tabMap.has(key) ? [key, tabMap.get(key)] : null)
      .filter(Boolean);
    const remaining = baseTabs.filter(([key]) => !tabOrder.includes(key));
    return [...ordered, ...remaining];
  }, [tabOrder, activeCoachUsers]);

  async function saveTabOrder(nextTabs) {
    const order = nextTabs.map(([key]) => key);
    setTabOrder(order);
    const { error: saveError } = await supabase
      .from("dashboard_tab_order")
      .upsert({ id: 1, tab_order: order, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (saveError) setError(`Tab order save failed: ${saveError.message}`);
  }

  async function reorderTabs(dropKey) {
    if (!draggedTab || !dropKey || draggedTab === dropKey) return;
    const currentTabs = [...tabs];
    const fromIndex = currentTabs.findIndex(([key]) => key === draggedTab);
    const toIndex = currentTabs.findIndex(([key]) => key === dropKey);
    if (fromIndex === -1 || toIndex === -1) {
      setDraggedTab(null);
      return;
    }
    const [moved] = currentTabs.splice(fromIndex, 1);
    currentTabs.splice(toIndex, 0, moved);
    setDraggedTab(null);
    await saveTabOrder(currentTabs);
  }

  async function loadData() {
    setLoading(true); setError("");
    const [teamsRes, settingsRes, tabOrderRes, usersRes, assignmentsRes, standingsRes, rankingsRes, resultsRes, aaRes, awardsRes, heismanRes, championsRes, draftRes, playoffRes, recruitingRes, historyRes] = await Promise.all([
      supabase.from("teams").select("*").order("name"),
      supabase.from("league_settings").select("*").eq("id", 1).single(),
      supabase.from("dashboard_tab_order").select("*").eq("id", 1).single(),
      supabase.from("discord_users").select("*").order("discord_username"),
      supabase.from("team_assignments").select("*, teams(name), discord_users(discord_username)").order("created_at"),
      supabase.from("team_standings").select("*").order("team_name"),
      supabase.from("commissioner_rankings").select("*").order("rank"),
      supabase.from("game_results").select(`*, team_1:teams!game_results_team_1_id_fkey(*), team_2:teams!game_results_team_2_id_fkey(*), user_1:discord_users!game_results_team_1_user_id_fkey(discord_username), user_2:discord_users!game_results_team_2_user_id_fkey(discord_username)`).order("created_at", { ascending: false }),
      supabase.from("all_americans").select("*, teams(name)").order("season_year", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("awards").select("*, teams(name)").order("season_year", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("heisman_winners").select("*, teams(name)").order("season_year", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("national_champions").select("*, teams(name), discord_users(discord_username)").order("season_year", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("draft_order_27").select("*, discord_users(discord_username)").order("pick_number"),
      supabase.from("playoff_games").select(`*, top_team:teams!playoff_games_top_team_id_fkey(name), bottom_team:teams!playoff_games_bottom_team_id_fkey(name)`).order("sort_order"),
      supabase.from("recruiting_classes").select("*, teams(name)").order("season_year", { ascending: false }),
      supabase.from("team_history_records").select("*, teams(name)").order("season_year", { ascending: false }),
    ]);
    const firstError = [teamsRes, settingsRes, tabOrderRes, usersRes, assignmentsRes, standingsRes, rankingsRes, resultsRes, aaRes, awardsRes, heismanRes, championsRes, draftRes, playoffRes, recruitingRes, historyRes].find((r) => r.error)?.error;
    if (firstError) setError(firstError.message);
    else {
      if (tabOrderRes.data?.tab_order) setTabOrder(tabOrderRes.data.tab_order);
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
  async function saveTeamAssets(team, draft) {
    const clean = (value) => {
      const text = String(value ?? "").trim();
      return text.length ? text : null;
    };

    const payload = {
      helmet_url: clean(draft?.helmet_url ?? team.helmet_url),
      logo_url: clean(draft?.logo_url ?? team.logo_url),
      primary_color: clean(draft?.primary_color ?? team.primary_color),
      secondary_color: clean(draft?.secondary_color ?? team.secondary_color),
    };

    const { error: updateError } = await supabase
      .from("teams")
      .update(payload)
      .eq("id", team.id);

    if (updateError) {
      setError(`Team asset save failed: ${updateError.message}`);
      return;
    }

    const { data: verifyRows, error: verifyError } = await supabase
      .from("teams")
      .select("id, name, helmet_url, logo_url, primary_color, secondary_color")
      .eq("id", team.id)
      .limit(1);

    if (verifyError) {
      setError(`Team asset save verification failed: ${verifyError.message}`);
      return;
    }

    const savedRow = verifyRows?.[0];
    const primarySaved = (savedRow?.primary_color || null) === payload.primary_color;
    const secondarySaved = (savedRow?.secondary_color || null) === payload.secondary_color;
    const helmetSaved = (savedRow?.helmet_url || null) === payload.helmet_url;
    const logoSaved = (savedRow?.logo_url || null) === payload.logo_url;

    if (!savedRow || !primarySaved || !secondarySaved || !helmetSaved || !logoSaved) {
      setError(`Team asset save did not persist for ${team.name}. Check Supabase RLS/policies for the teams table.`);
      return;
    }

    setError(`Saved team assets for ${team.name}.`);
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

  return <div style={page}><div style={container}><Header loading={loading} reload={loadData}/>{error && <div style={errorBox}>{error}</div>}<TabBar tabs={tabs} activeTab={activeTab} setActiveTab={setActiveTab} draggedTab={draggedTab} setDraggedTab={setDraggedTab} reorderTabs={reorderTabs}/>
    {activeTab === "dashboard" && <><Stats currentYear={currentYear} setCurrentYear={(value)=>{setCurrentYear(value); setNewResult((prev)=>({...prev, season_year: Number(value)}));}} currentWeek={currentWeek} setCurrentWeek={(value)=>{setCurrentWeek(value); setNewResult((prev)=>({...prev, week: value}));}} teams={activeTeamOptions} assignments={assignments} saveSettings={saveLeagueSettings}/><LeaguePulse teams={activeTeamOptions} results={currentYearResults} allAmericans={allAmericans} awards={awards} currentYear={currentYear}/><ComputerRankings teams={activeTeamOptions} results={currentYearResults} currentWeek={currentWeek} sortState={userSort} setSortState={setUserSort}/><DashboardRecognition allAmericanRows={rankingRows(activeTeamOptions, allAmericans)} awardRows={rankingRows(activeTeamOptions, awards)}/><RecentActivity results={currentYearResults} allAmericans={allAmericans} awards={awards} heismans={heismans} champions={nationalChampions}/><RecordResult newResult={newResult} setNewResult={setNewResult} teams={activeTeamOptions} users={userOptions} assignments={assignments} submitResult={submitResult}/></>}
    {activeTab === "allTimeStandings" && <AllTimeUserStandings users={userOptions} teams={teamOptions} assignments={assignments} results={results} sortState={commissionerSort} setSortState={setCommissionerSort}/>}    
    {activeTab === "coachHOF" && <CoachHallOfFame users={userOptions} teams={teamOptions} assignments={assignments} results={results} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting}/>}    
    {activeTab === "playerHOF" && <PlayerHallOfFame teams={teamOptions} assignments={assignments} results={results} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions}/>}    
    {activeTab === "assignments" && <Assignments rows={assignments} teams={teamOptions} users={userOptions} addAssignment={addAssignment} updateRow={updateRow} deleteRow={deleteRow} drafts={draftAssignments} setDrafts={setDraftAssignments} saveDraft={saveDraft} getDraft={getDraft} teamChange={teamChange} setTeamChange={setTeamChange} changeUserTeam={changeUserTeam}/>}    
    {activeTab === "h2h" && <H2H results={results} search={search.h2h} setSearch={(v)=>setSearch({...search,h2h:v})}/>}    
    {activeTab === "allAmericans" && <AllAmericans rows={allAmericans} teams={teamOptions} addRow={addAA} updateRow={updateRow} deleteRow={deleteRow} rankings={[]} drafts={draftAllAmericans} setDrafts={setDraftAllAmericans} saveDraft={saveDraft} getDraft={getDraft}/>}    
    {activeTab === "awards" && <Awards rows={awards} teams={teamOptions} addRow={addAward} updateRow={updateRow} deleteRow={deleteRow} rankings={[]} drafts={draftAwards} setDrafts={setDraftAwards} saveDraft={saveDraft} getDraft={getDraft}/>}    
    {activeTab === "heismans" && <Heismans rows={heismans} teams={teamOptions} addRow={addHeisman} updateRow={updateRow} deleteRow={deleteRow} drafts={draftHeismans} setDrafts={setDraftHeismans} saveDraft={saveDraft} getDraft={getDraft}/>}    
    {activeTab === "nationalChampions" && <NationalChampions rows={nationalChampions} teams={teamOptions} users={userOptions} addRow={addNationalChampion} updateRow={updateRow} deleteRow={deleteRow} drafts={draftChampions} setDrafts={setDraftChampions} saveDraft={saveDraft} getDraft={getDraft}/>}        
    {selectedCoach && <CoachProfile user={selectedCoach} teams={teamOptions} assignments={assignments} results={results} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting}/>}    
  </div></div>;
}


function qualityWins(teamId, results) {
  return results.filter((result) => {
    const s1 = Number(result.team_1_score || 0);
    const s2 = Number(result.team_2_score || 0);
    const team1Win = result.team_1_id === teamId && s1 > s2;
    const team2Win = result.team_2_id === teamId && s2 > s1;
    if (!team1Win && !team2Win) return false;
    const opponentRank = team1Win ? Number(result.team_2_rank) : Number(result.team_1_rank);
    return opponentRank >= 1 && opponentRank <= 25;
  }).length;
}

function computerRankingRows(teams, results) {
  const base = teams.map((team) => {
    const rec = recordFromResults(team.id, results);
    const games = rec.games || 0;
    const winPct = games ? rec.wins / games : 0;
    const avgPf = Number(rec.avgPf);
    const avgPa = Number(rec.avgPa);
    const sor = Number(strengthOfResult(team.id, teams, results)) || 0;
    const qw = qualityWins(team.id, results);
    const margin = avgPf - avgPa;
    const score = (winPct * 45) + (sor * 3.5) + (qw * 6) + (Math.max(-20, Math.min(30, margin)) * 0.45) + (rec.wins * 1.5);
    return { team, teamName: team.name, wins: rec.wins, losses: rec.losses, games, avgPf, avgPa, top25: top25Wins(team.id, results), qw, sor, score: Number(score.toFixed(1)) };
  });
  return base.sort((a,b)=>b.score-a.score || b.wins-a.wins || a.losses-b.losses || a.teamName.localeCompare(b.teamName)).map((row,index)=>({...row, rank:index+1}));
}

function LeaguePulse({ teams, results, allAmericans = [], awards = [], currentYear }) {
  const rows = computerRankingRows(teams, results);
  const bestOffense = [...rows].sort((a,b)=>b.avgPf-a.avgPf)[0];
  const bestDefense = [...rows].filter((r)=>r.games).sort((a,b)=>a.avgPa-b.avgPa)[0];
  const qwLeader = [...rows].sort((a,b)=>b.qw-a.qw)[0];
  const toughest = [...rows].sort((a,b)=>b.sor-a.sor)[0];
  const worstDefense = [...rows].filter((r)=>r.games).sort((a,b)=>b.avgPa-a.avgPa)[0];
  const leastAvgPf = [...rows].filter((r)=>r.games).sort((a,b)=>a.avgPf-b.avgPf)[0];
  const easiestRoad = [...rows].filter((r)=>r.games).sort((a,b)=>a.sor-b.sor)[0];
  const worstResume = [...rows].filter((r)=>r.games).sort((a,b)=>a.score-b.score)[0];
  const yearAA = allAmericans.filter((row)=>String(row.season_year) === String(currentYear));
  const yearAwards = awards.filter((row)=>String(row.season_year) === String(currentYear));
  const aaLeader = rankingRows(teams, yearAA)[0];
  const awardLeader = rankingRows(teams, yearAwards)[0];

  return <div style={pulseGrid}>
    <PulseCard title="#1 Computer Rank" value={rows[0]?.teamName || "—"} sub={rows[0] ? `${rows[0].wins}-${rows[0].losses} · ${rows[0].score} score` : "No games yet"}/>
    <PulseCard title="Best Offense" value={bestOffense?.teamName || "—"} sub={bestOffense ? `${bestOffense.avgPf.toFixed(1)} Avg PF` : "—"}/>
    <PulseCard title="Best Defense" value={bestDefense?.teamName || "—"} sub={bestDefense ? `${bestDefense.avgPa.toFixed(1)} Avg PA` : "—"}/>
    <PulseCard title="Best Resume" value={qwLeader?.teamName || "—"} sub={qwLeader ? `${qwLeader.qw} quality wins` : "—"}/>
    <PulseCard title="Toughest Road" value={toughest?.teamName || "—"} sub={toughest ? `${toughest.sor.toFixed(1)} SOR` : "—"}/>
    <PulseCard title="Worst Defense" value={worstDefense?.teamName || "—"} sub={worstDefense ? `${worstDefense.avgPa.toFixed(1)} Avg PA allowed` : "—"}/>
    <PulseCard title="Least Avg PF" value={leastAvgPf?.teamName || "—"} sub={leastAvgPf ? `${leastAvgPf.avgPf.toFixed(1)} Avg PF` : "—"}/>
    <PulseCard title="Easiest Road" value={easiestRoad?.teamName || "—"} sub={easiestRoad ? `${easiestRoad.sor.toFixed(1)} SOR` : "—"}/>
    <PulseCard title="Worst Resume" value={worstResume?.teamName || "—"} sub={worstResume ? `${worstResume.score.toFixed(1)} computer score` : "—"}/>
    <PulseCard title="Most All-Americans" value={aaLeader?.team || "—"} sub={aaLeader ? `${aaLeader.total} in ${currentYear}` : `0 in ${currentYear}`}/>
    <PulseCard title="Most Awards Won" value={awardLeader?.team || "—"} sub={awardLeader ? `${awardLeader.total} in ${currentYear}` : `0 in ${currentYear}`}/>
  </div>;
}

function PulseCard({ title, value, sub }) { return <div style={pulseCard}><div style={statTitle}>{title}</div><div style={pulseValue}>{value}</div><div style={mutedText}>{sub}</div></div>; }

function rankingMovement(currentRank, previousRank) {
  if (!previousRank || !currentRank) return { label: "NEW", style: movementNeutral };
  const change = previousRank - currentRank;
  if (change > 0) return { label: `▲ ${change}`, style: movementUp };
  if (change < 0) return { label: `▼ ${Math.abs(change)}`, style: movementDown };
  return { label: "—", style: movementNeutral };
}

function MovementBadge({ currentRank, previousRank }) {
  const movement = rankingMovement(currentRank, previousRank);
  return <span style={movement.style}>{movement.label}</span>;
}

function ComputerRankings({ teams, results, currentWeek, sortState, setSortState }) {
  const baseRows = computerRankingRows(teams, results);
  const previousResults = results.filter((result) => weekIndex(result.week) < weekIndex(currentWeek));
  const previousRows = computerRankingRows(teams, previousResults);
  const previousRankMap = new Map(previousRows.map((row) => [row.team.id, row.rank]));
  const activeSort = sortState?.key ? sortState : { key: "score", direction: "desc" };
  const rows = [...baseRows].sort((a,b)=>compareForSort(a,b,activeSort.key,activeSort.direction));
  return <section style={card}><div style={sectionTop}><div><h2 style={sectionTitle}>CFBElite Computer Rankings</h2><p style={mutedText}>Automated 32-user ranking. Formula: record, SOR, quality wins, scoring margin, and wins. Movement compares current rank to the rank through the previous league week.</p></div></div><Table headers={["#","Move",<SortButton label="Team" sortKey="teamName" sortState={activeSort} setSortState={setSortState}/>,<SortButton label="Record" sortKey="record" sortState={activeSort} setSortState={setSortState}/>,<SortButton label="QW" sortKey="qw" sortState={activeSort} setSortState={setSortState}/>,<SortButton label="Avg PF" sortKey="avgPf" sortState={activeSort} setSortState={setSortState}/>,<SortButton label="Avg PA" sortKey="avgPa" sortState={activeSort} setSortState={setSortState}/>,<SortButton label="SOR" sortKey="sor" sortState={activeSort} setSortState={setSortState}/>,<SortButton label="Score" sortKey="score" sortState={activeSort} setSortState={setSortState}/>]}>{rows.map((row)=><tr key={row.team.id} style={trStyle}><td style={rankCell}>#{row.rank}</td><td style={td}><MovementBadge currentRank={row.rank} previousRank={previousRankMap.get(row.team.id)}/></td><td style={teamCell}><TeamLabel team={row.team}/></td><td style={td}>{row.wins}-{row.losses}</td><td style={td}>{row.qw}</td><td style={td}>{row.avgPf.toFixed(1)}</td><td style={td}>{row.avgPa.toFixed(1)}</td><td style={td}>{row.sor.toFixed(1)}</td><td style={scoreCell}>{row.score.toFixed(1)}</td></tr>)}</Table></section>;
}

function DashboardRecognition({ allAmericanRows, awardRows }) {
  const cleanAA = allAmericanRows.filter((r)=>r.total>0).slice(0,10);
  const cleanAwards = awardRows.filter((r)=>r.total>0).slice(0,10);
  return <section style={card}><h2 style={sectionTitle}>Recognition Leaders</h2><div style={twoCol}><LeaderboardCard title="All-American Rankings" rows={cleanAA}/><LeaderboardCard title="Awards Rankings" rows={cleanAwards}/></div></section>;
}
function LeaderboardCard({ title, rows }) { return <div style={miniCard}><h3 style={miniTitle}>{title}</h3>{rows.length ? rows.map((r,i)=><div key={r.team} style={leaderRow}><span>#{i+1} {r.team}</span><b>{r.total}</b></div>) : <div style={miniRow}>No entries yet.</div>}</div>; }

function RecentActivity({ results, allAmericans, awards, heismans, champions }) {
  const items = [
    ...results.map((r)=>({time:r.created_at, text:`Result: ${r.team_1?.name || "Team 1"} ${r.team_1_score}-${r.team_2_score} ${r.team_2?.name || "Team 2"}`})),
    ...allAmericans.map((r)=>({time:r.created_at, text:`All-American: ${r.player_name} (${r.teams?.name || "Team"})`})),
    ...awards.map((r)=>({time:r.created_at, text:`Award: ${r.player_name} won ${r.award_name}`})),
    ...heismans.map((r)=>({time:r.created_at, text:`Heisman: ${r.player_name} (${r.teams?.name || "Team"})`})),
    ...champions.map((r)=>({time:r.created_at, text:`National Champion: ${r.teams?.name || "Team"} (${r.season_year})`})),
  ].sort((a,b)=>new Date(b.time||0)-new Date(a.time||0)).slice(0,12);
  return <section style={card}><h2 style={sectionTitle}>Recent Activity</h2><div style={activityList}>{items.length ? items.map((item,i)=><div key={i} style={activityItem}>{item.text}</div>) : <div style={miniRow}>No recent activity yet.</div>}</div></section>;
}

function allTimeUserRankingRows(users, teams, assignments, results) {
  const rows = users.map((user) => {
    const userResults = results.filter((result) => {
      const team1UserId = result.team_1_user_id || coachForTeamYear(result.team_1_id, result.season_year, assignments)?.discord_user_id;
      const team2UserId = result.team_2_user_id || coachForTeamYear(result.team_2_id, result.season_year, assignments)?.discord_user_id;
      return team1UserId === user.id || team2UserId === user.id;
    });
    let wins = 0, losses = 0, pf = 0, pa = 0, qw = 0;
    userResults.forEach((result) => {
      const team1UserId = result.team_1_user_id || coachForTeamYear(result.team_1_id, result.season_year, assignments)?.discord_user_id;
      const isUserTeam1 = team1UserId === user.id;
      const forPts = Number(isUserTeam1 ? result.team_1_score : result.team_2_score) || 0;
      const againstPts = Number(isUserTeam1 ? result.team_2_score : result.team_1_score) || 0;
      const oppRank = Number(isUserTeam1 ? result.team_2_rank : result.team_1_rank);
      pf += forPts;
      pa += againstPts;
      if (forPts > againstPts) {
        wins += 1;
        if (oppRank >= 1 && oppRank <= 25) qw += 1;
      } else if (forPts < againstPts) {
        losses += 1;
      }
    });
    const games = wins + losses;
    const activeAssignment = assignments.find((assignment) => assignment.discord_user_id === user.id && assignment.status === "Active");
    const currentTeam = teams.find((team) => team.id === activeAssignment?.team_id);
    const avgPf = games ? pf / games : 0;
    const avgPa = games ? pa / games : 0;
    const winPct = games ? wins / games : 0;
    const score = (winPct * 60) + (qw * 4) + ((avgPf - avgPa) * 0.5) + (wins * 1.25);
    return { user, discord: user.discord_username, currentTeam, teamName: user.discord_username, wins, losses, games, avgPf, avgPa, qw, score: Number(score.toFixed(1)) };
  });
  return rows.sort((a,b)=>b.score-a.score || b.wins-a.wins || a.losses-b.losses || a.discord.localeCompare(b.discord));
}

function AllTimeUserStandings({ users, teams, assignments, results, sortState, setSortState }) {
  const baseRows = allTimeUserRankingRows(users, teams, assignments, results);
  const activeSort = sortState?.key && sortState.key !== "manual" ? sortState : { key: "score", direction: "desc" };
  const rows = [...baseRows].sort((a,b)=>compareForSort(a,b,activeSort.key,activeSort.direction));
  return <section style={card}><h2 style={sectionTitle}>All-Time User Standings</h2><p style={mutedText}>All recorded user games across every season, grouped by Discord user. Current team is listed for context.</p><Table headers={["#",<SortButton label="Discord User" sortKey="discord" sortState={activeSort} setSortState={setSortState}/>,"Current Team",<SortButton label="Record" sortKey="record" sortState={activeSort} setSortState={setSortState}/>,<SortButton label="QW" sortKey="qw" sortState={activeSort} setSortState={setSortState}/>,<SortButton label="Avg PF" sortKey="avgPf" sortState={activeSort} setSortState={setSortState}/>,<SortButton label="Avg PA" sortKey="avgPa" sortState={activeSort} setSortState={setSortState}/>,<SortButton label="Score" sortKey="score" sortState={activeSort} setSortState={setSortState}/>]}>{rows.map((row,index)=><tr key={row.user.id} style={trStyle}><td style={rankCell}>#{index + 1}</td><td style={teamCell}>{row.discord}</td><td style={td}>{row.currentTeam ? <TeamLabel team={row.currentTeam}/> : "—"}</td><td style={td}>{row.wins}-{row.losses}</td><td style={td}>{row.qw}</td><td style={td}>{row.avgPf.toFixed(1)}</td><td style={td}>{row.avgPa.toFixed(1)}</td><td style={scoreCell}>{row.score.toFixed(1)}</td></tr>)}</Table></section>;
}

function rowsForCoachUser(rows, user, assignments) {
  return rows.filter((row) => {
    const assignment = coachForTeamYear(row.team_id, row.season_year, assignments);
    return assignment?.discord_user_id === user.id;
  });
}

function RecognitionTable({ title, headers, rows }) {
  return <div style={miniCard}><h3 style={miniTitle}>{title}</h3><Table headers={headers}>{rows.length ? rows.map((row, index)=><tr key={row.id || index} style={trStyle}>{row.cells.map((cell, cellIndex)=><td key={cellIndex} style={cellIndex === 0 ? teamCell : td}>{cell}</td>)}</tr>) : <tr style={trStyle}><td style={td} colSpan={headers.length}>No records yet.</td></tr>}</Table></div>;
}

function assignmentYears(assignment) {
  const start = Number(assignment.start_year || 0);
  const end = assignment.end_year ? Number(assignment.end_year) : null;
  if (!start) return "—";
  return end ? `${start}-${end}` : `${start}-Present`;
}

function assignmentResultScope(assignment, results) {
  const start = Number(assignment.start_year || 0);
  const end = assignment.end_year ? Number(assignment.end_year) : 9999;
  return results.filter((result) => {
    const year = Number(result.season_year || 0);
    return result.team_1_id === assignment.team_id || result.team_2_id === assignment.team_id
      ? year >= start && year <= end
      : false;
  });
}

function assignmentAwardScope(assignment, rows) {
  const start = Number(assignment.start_year || 0);
  const end = assignment.end_year ? Number(assignment.end_year) : 9999;
  return rows.filter((row) => {
    const year = Number(row.season_year || 0);
    return row.team_id === assignment.team_id && year >= start && year <= end;
  });
}

function CoachTimelineTable({ timeline, teams, results, allAmericans, awards, heismans, nationalChampions }) {
  const rows = timeline.map((assignment) => {
    const team = teams.find((item) => item.id === assignment.team_id);
    const scopedResults = assignmentResultScope(assignment, results);
    const rec = recordFromResults(assignment.team_id, scopedResults);
    const scopedAA = assignmentAwardScope(assignment, allAmericans);
    const scopedAwards = assignmentAwardScope(assignment, awards);
    const scopedHeismans = assignmentAwardScope(assignment, heismans);
    const confTitles = titleCount(assignment.team_id, scopedResults, "Conference Championship Week");
    const nattysByResult = titleCount(assignment.team_id, scopedResults, "National Championship Week");
    const start = Number(assignment.start_year || 0);
    const end = assignment.end_year ? Number(assignment.end_year) : 9999;
    const nattysByEntry = nationalChampions.filter((champion) => {
      const year = Number(champion.season_year || 0);
      return champion.team_id === assignment.team_id && year >= start && year <= end;
    }).length;
    return { assignment, team, rec, allAmericans: scopedAA.length, awards: scopedAwards.length, heismans: scopedHeismans.length, confTitles, nattys: Math.max(nattysByResult, nattysByEntry) };
  });

  return <div style={miniCard}><h3 style={miniTitle}>Career Timeline</h3><Table headers={["Years", "School", "Record", "All-Americans", "Awards", "Conf Titles", "Heismans", "Nattys"]}>{rows.length ? rows.map((row)=><tr key={row.assignment.id} style={trStyle}><td style={td}>{assignmentYears(row.assignment)}</td><td style={teamCell}>{row.team ? <TeamLabel team={row.team}/> : teamNameById(row.assignment.team_id, teams)}</td><td style={td}>{row.rec.wins}-{row.rec.losses}</td><td style={td}>{row.allAmericans}</td><td style={td}>{row.awards}</td><td style={td}>{row.confTitles}</td><td style={td}>{row.heismans}</td><td style={td}>{row.nattys}</td></tr>) : <tr style={trStyle}><td style={td} colSpan={8}>No team history assigned.</td></tr>}</Table></div>;
}

function CoachProfile({ user, teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting }) {
  const coachStats = getCoachStats(usersFallback(user), teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting);
  const stats = coachStats.find((row)=>row.userId === user.id) || { wins:0, losses:0, nattys:0, confTitles:0, top25Wins:0, awards:0, allAmericans:0, heismans:0, prestige:0 };
  const activeAssignment = assignments.find((a)=>a.discord_user_id===user.id && a.status==="Active");
  const currentTeam = teams.find((t)=>t.id===activeAssignment?.team_id);
  const timeline = assignments.filter((a)=>a.discord_user_id===user.id).sort((a,b)=>Number(a.start_year||0)-Number(b.start_year||0));
  const coachResults = results.filter((result) => {
    const team1UserId = result.team_1_user_id || coachForTeamYear(result.team_1_id, result.season_year, assignments)?.discord_user_id;
    const team2UserId = result.team_2_user_id || coachForTeamYear(result.team_2_id, result.season_year, assignments)?.discord_user_id;
    return team1UserId === user.id || team2UserId === user.id;
  });
  const coachAA = rowsForCoachUser(allAmericans, user, assignments);
  const coachAwards = rowsForCoachUser(awards, user, assignments);
  const coachHeismans = rowsForCoachUser(heismans, user, assignments);

  return <section style={profileCard}>
    <div style={profileHero}><div><div style={eyebrow}>Coach Profile</div><h2 style={profileName}>{user.discord_username}</h2><p style={mutedText}>Current Team: {currentTeam?.name || "Unassigned"}</p></div></div>
    <div style={statsGrid}><Stat title="Career Record" value={`${stats?.wins||0}-${stats?.losses||0}`}/><Stat title="National Titles" value={stats?.nattys||0}/><Stat title="Conference Titles" value={stats?.confTitles||0}/><Stat title="Top 25 Wins" value={stats?.top25Wins||0}/><Stat title="Awards" value={stats?.awards||0}/><Stat title="All-Americans" value={stats?.allAmericans||0}/><Stat title="Heismans" value={stats?.heismans||0}/><Stat title="Prestige" value={(stats?.prestige||0).toFixed(1)}/></div>
    <CoachTimelineTable timeline={timeline} teams={teams} results={results} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions}/>
    <Results rows={coachResults} deleteResult={()=>{}} search="" setSearch={()=>{}}/>
    <RecognitionTable title="All-Americans" headers={["Player","Position","Team","Year","Type"]} rows={coachAA.map((r)=>({id:r.id,cells:[r.player_name,r.position,teamNameById(r.team_id,teams),r.season_year,r.type]}))}/>
    <RecognitionTable title="Award Winners" headers={["Player","Position","Team","Year","Award"]} rows={coachAwards.map((r)=>({id:r.id,cells:[r.player_name,r.position,teamNameById(r.team_id,teams),r.season_year,r.award_name]}))}/>
    <RecognitionTable title="Heisman Winners" headers={["Player","Position","Team","Year"]} rows={coachHeismans.map((r)=>({id:r.id,cells:[r.player_name,r.position,teamNameById(r.team_id,teams),r.season_year]}))}/>
  </section>;
}

function usersFallback(user) { return [user]; }

function coachHofCriteria(row) {
  const accolades = row.heismans + row.awards + row.allAmericans;
  const qualifies = row.nattys >= 2 || (row.nattys >= 1 && row.confTitles >= 3) || row.wins >= 50 || row.top25Wins >= 20 || row.rawPrestige >= 100 || (accolades >= 25 && row.wins >= 25);
  const reasons = [];
  if (row.nattys >= 2) reasons.push("2+ National Titles");
  if (row.nattys >= 1 && row.confTitles >= 3) reasons.push("Title + 3 Conf Titles");
  if (row.wins >= 50) reasons.push("50+ Career Wins");
  if (row.top25Wins >= 20) reasons.push("20+ Top 25 Wins");
  if (row.rawPrestige >= 100) reasons.push("100+ HOF Score");
  if (accolades >= 25 && row.wins >= 25) reasons.push("25+ Major Accolades");
  return { qualifies, reasons };
}

function CoachHallOfFame({ users, teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting }) {
  const rows = getCoachStats(users, teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting)
    .map((row)=>({ ...row, hofCriteria: coachHofCriteria(row) }))
    .filter((row)=>row.hofCriteria.qualifies)
    .sort((a,b)=>b.rawPrestige-a.rawPrestige || b.wins-a.wins);
  return <section style={card}><h2 style={sectionTitle}>Coach Hall of Fame</h2><p style={mutedText}>Coaches qualify automatically by meeting tougher benchmarks: 2 national titles, 1 title plus 3 conference titles, 50 career wins, 20 Top 25 wins, 100+ HOF score, or 25+ major accolades with 25+ wins.</p>{rows.length ? <div style={hofGrid}>{rows.map((row)=><CoachHofCard key={row.userId || row.discord} row={row} teams={teams} assignments={assignments}/>)}</div> : <div style={miniRow}>No coaches have met Hall of Fame criteria yet.</div>}</section>;
}
function CoachHofCard({ row, teams, assignments }) {
  const activeAssignment = assignments.find((a)=>a.discord_user_id===row.userId && a.status==="Active");
  const team = teams.find((t)=>t.id===activeAssignment?.team_id);
  return <div style={hofCard}><div style={hofTopClean}><div style={hofIconWrap}><span style={hofIcon}>🎧</span>{team && <span style={hofMiniLogo}><HofTeamIcon team={team}/></span>}</div><div style={{minWidth:0}}><div style={eyebrow}>Coach Hall of Fame</div><h3 style={hofName}>{row.discord}</h3><div style={mutedText}>{team?.name || row.activeTeamsText}</div></div></div><div style={hofScoreBand}><span>HOF Score</span><b style={hofScoreBandB}>{Math.round(row.rawPrestige)}</b></div><div style={hofReason}>{row.hofCriteria.reasons.join(" • ")}</div><div style={hofChips}><Chip label="Career" value={`${row.wins}-${row.losses}`}/><Chip label="Nattys" value={row.nattys}/><Chip label="Conf" value={row.confTitles}/><Chip label="Top 25" value={row.top25Wins}/><Chip label="Bowl" value={`${row.bowlWins}-${row.bowlLosses}`}/><Chip label="Heisman" value={row.heismans}/><Chip label="Awards" value={row.awards}/><Chip label="All-Americans" value={row.allAmericans}/></div></div>;
}
function Chip({ label, value }) { return <div style={chip}><b>{value}</b><span>{label}</span></div>; }
function HofTeamIcon({ team }) { const url = getHelmetUrl(team); return url ? <img src={url} alt="" style={hofTeamImg}/> : <span style={hofIcon}>🏈</span>; }

function playerHallRows(teams, assignments, results, allAmericans, awards, heismans, nationalChampions) {
  const map = new Map();
  const keyFor = (name, teamId) => `${name || "Unknown"}-${teamId || "none"}`;
  const ensure = (name, teamId, position, year) => {
    const key = keyFor(name, teamId);
    if (!map.has(key)) map.set(key, { key, player:name || "Unknown Player", teamId, position:position || "—", years:new Set(), awards:[], allAmericans:[], heismans:[], confTitles:0, nattys:0, score:0, reasons:[] });
    const row = map.get(key);
    if (position) row.position = position;
    if (year) row.years.add(String(year));
    return row;
  };
  allAmericans.forEach((r)=>{ const row=ensure(r.player_name, r.team_id, r.position, r.season_year); row.allAmericans.push(`${r.season_year} ${r.type}`); });
  awards.forEach((r)=>{ const row=ensure(r.player_name, r.team_id, r.position, r.season_year); row.awards.push(`${r.season_year} ${r.award_name}`); });
  heismans.forEach((r)=>{ const row=ensure(r.player_name, r.team_id, r.position, r.season_year); row.heismans.push(`${r.season_year} Heisman`); });
  map.forEach((row)=>{
    row.years.forEach((year)=>{
      const conf = results.some((r)=>String(r.season_year)===String(year) && r.week==="Conference Championship Week" && ((r.team_1_id===row.teamId && Number(r.team_1_score)>Number(r.team_2_score)) || (r.team_2_id===row.teamId && Number(r.team_2_score)>Number(r.team_1_score))));
      const nattyByResult = results.some((r)=>String(r.season_year)===String(year) && r.week==="National Championship Week" && ((r.team_1_id===row.teamId && Number(r.team_1_score)>Number(r.team_2_score)) || (r.team_2_id===row.teamId && Number(r.team_2_score)>Number(r.team_1_score))));
      const nattyByEntry = nationalChampions.some((c)=>String(c.season_year)===String(year) && c.team_id===row.teamId);
      if (conf) row.confTitles += 1;
      if (nattyByResult || nattyByEntry) row.nattys += 1;
    });
    row.score = row.heismans.length*30 + row.awards.length*12 + row.allAmericans.length*8 + row.nattys*18 + row.confTitles*8;
    if (row.heismans.length >= 1) row.reasons.push("Heisman Winner");
    if (row.heismans.length >= 1 && (row.awards.length >= 1 || row.allAmericans.length >= 2)) row.reasons.push("Heisman + Supporting Accolades");
    if (row.awards.length >= 3) row.reasons.push("3+ Major Awards");
    if (row.allAmericans.length >= 4) row.reasons.push("4+ All-American Selections");
    if (row.nattys >= 1 && (row.heismans.length || row.awards.length >= 2 || row.allAmericans.length >= 3)) row.reasons.push("Elite Title Season Accolade");
    if (row.score >= 32) row.reasons.push("32+ HOF Score");
  });
  return [...map.values()].filter((r)=>(r.heismans.length >= 1 && (r.awards.length >= 1 || r.allAmericans.length >= 2)) || r.awards.length >= 3 || r.allAmericans.length >= 4 || (r.nattys >= 1 && (r.heismans.length || r.awards.length >= 2 || r.allAmericans.length >= 3)) || r.score >= 60).sort((a,b)=>b.score-a.score || a.player.localeCompare(b.player));
}
function PlayerHallOfFame({ teams, assignments, results, allAmericans, awards, heismans, nationalChampions }) {
  const rows = playerHallRows(teams, assignments, results, allAmericans, awards, heismans, nationalChampions);
  return <section style={card}><h2 style={sectionTitle}>Player Hall of Fame</h2><p style={mutedText}>Players qualify automatically by tougher benchmarks: Heisman plus supporting accolades, 3 major awards, 4 All-American selections, elite title-season accolades, or 60+ HOF score.</p>{rows.length ? <div style={hofGrid}>{rows.map((row)=><PlayerHofCard key={row.key} row={row} team={teams.find((t)=>t.id===row.teamId)}/>)}</div> : <div style={miniRow}>No players have met Hall of Fame criteria yet.</div>}</section>;
}
function PlayerHofCard({ row, team }) { return <div style={hofCard}><div style={hofTopClean}><div style={hofIconWrap}>{team ? <HofTeamIcon team={team}/> : <span style={hofIcon}>🏈</span>}</div><div style={{minWidth:0}}><div style={eyebrow}>Player Hall of Fame</div><h3 style={hofName}>{row.player}</h3><div style={mutedText}>{row.position} · {team?.name || "Unknown Team"}</div></div></div><div style={hofScoreBand}><span>HOF Score</span><b style={hofScoreBandB}>{row.score}</b></div><div style={hofReason}>{row.reasons.join(" • ")}</div><div style={hofChips}><Chip label="Heisman" value={row.heismans.length}/><Chip label="Awards" value={row.awards.length}/><Chip label="All-Americans" value={row.allAmericans.length}/><Chip label="Nattys" value={row.nattys}/><Chip label="Conf" value={row.confTitles}/></div><div style={accoladeList}>{[...row.heismans, ...row.awards, ...row.allAmericans].slice(0,8).map((x,i)=><div key={i} style={miniRow}>{x}</div>)}</div></div>; }

function Header({ loading, reload }) {
  return (
    <header style={heroBanner}>
      <img src="/cfbelite-banner.png" alt="CFBElite 27 Dynasty" style={heroBannerImage} />
      <div style={heroOverlay} />
      <div style={heroContent}>
        <div>
          <h1 style={heroTitle}>CFBElite 27 Dynasty</h1>
          <p style={heroSubtitle}>Live Supabase League Management System</p>
        </div>
        <button onClick={reload} style={statusBox}>
          {loading ? "Loading..." : "LIVE DATABASE"}
        </button>
      </div>
    </header>
  );
}
function TabBar({ tabs, activeTab, setActiveTab, draggedTab, setDraggedTab, reorderTabs }) {
  return (
    <div style={tabScroller}>
      <div style={tabRow}>
        {tabs.map(([key,label])=>(
          <button
            key={key}
            draggable
            onDragStart={()=>setDraggedTab(key)}
            onDragOver={(event)=>event.preventDefault()}
            onDrop={()=>reorderTabs(key)}
            onClick={()=>setActiveTab(key)}
            title="Drag tabs left or right to rearrange. The order saves for everyone."
            style={activeTab===key?activeTabStyle:tabStyle}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
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
      <p style={mutedText}>Fully automated across all years from recorded games, team assignments, awards, All-Americans, Heismans, national champions, and recruiting ranks.</p>
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
      <p style={mutedText}>Generated from current-year results only. Each recorded result is mentioned once, with no manual writing required.</p>
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

function weekSortValue(week) {
  const index = WEEKS.indexOf(week);
  return index === -1 ? 999 : index;
}

function resultSortValue(result) {
  return Number(result.season_year || 0) * 1000 + weekSortValue(result.week);
}

function getDirectedH2HRows(results) {
  const map = new Map();

  results.forEach((result) => {
    const user1 = result.user_1?.discord_username;
    const user2 = result.user_2?.discord_username;
    if (!user1 || !user2) return;

    const score1 = Number(result.team_1_score || 0);
    const score2 = Number(result.team_2_score || 0);
    if (score1 === score2) return;

    const winner = score1 > score2 ? user1 : user2;
    const gameOrder = resultSortValue(result);
    const createdOrder = result.created_at ? new Date(result.created_at).getTime() : 0;
    const game = { winner, gameOrder, createdOrder };

    [[user1, user2], [user2, user1]].forEach(([user, opponent]) => {
      const key = `${user}-${opponent}`;
      if (!map.has(key)) map.set(key, { user, opp: opponent, w: 0, l: 0, games: [] });
      const row = map.get(key);
      if (winner === user) row.w += 1;
      else row.l += 1;
      row.games.push(game);
    });
  });

  return [...map.values()].map((row) => {
    const orderedGames = [...row.games].sort((a, b) => {
      if (b.gameOrder !== a.gameOrder) return b.gameOrder - a.gameOrder;
      return b.createdOrder - a.createdOrder;
    });

    if (!orderedGames.length) return { ...row, streak: "—" };

    const latestIsWin = orderedGames[0].winner === row.user;
    let streakCount = 0;

    for (const game of orderedGames) {
      const isWin = game.winner === row.user;
      if (isWin !== latestIsWin) break;
      streakCount += 1;
    }

    return {
      ...row,
      streak: `${latestIsWin ? "W" : "L"}${streakCount}`,
    };
  });
}

function TeamAssets({ teams, saveTeamAssets }) {
  const [drafts, setDrafts] = useState({});

  useEffect(() => {
    setDrafts((previous) => {
      const next = { ...previous };
      teams.forEach((team) => {
        next[team.id] = {
          helmet_url: previous[team.id]?.helmet_url ?? team.helmet_url ?? "",
          logo_url: previous[team.id]?.logo_url ?? team.logo_url ?? "",
          primary_color: previous[team.id]?.primary_color ?? team.primary_color ?? "",
          secondary_color: previous[team.id]?.secondary_color ?? team.secondary_color ?? "",
        };
      });
      return next;
    });
  }, [teams]);

  const updateDraft = (teamId, field, value) => {
    setDrafts((previous) => ({
      ...previous,
      [teamId]: {
        ...(previous[teamId] || {}),
        [field]: value,
      },
    }));
  };

  return (
    <section style={card}>
      <div style={sectionTop}>
        <div>
          <h2 style={sectionTitle}>Team Helmet / Logo Admin</h2>
          <p style={mutedText}>Paste helmet/logo URLs and team colors for the 32 active league teams. Colors drive each team page background and text.</p>
        </div>
      </div>
      <Table headers={["Preview", "Team", "Helmet URL", "Logo URL", "Primary Color", "Secondary Color", "Save"]}>
        {teams.map((team) => {
          const draft = drafts[team.id] || {
            helmet_url: team.helmet_url || "",
            logo_url: team.logo_url || "",
            primary_color: team.primary_color || "",
            secondary_color: team.secondary_color || "",
          };
          const previewTeam = { ...team, ...draft };
          return (
            <tr key={team.id} style={trStyle}>
              <td style={td}><TeamLabel team={previewTeam} /></td>
              <td style={teamCell}>{team.name}</td>
              <td style={td}><input value={draft.helmet_url} onChange={(e)=>updateDraft(team.id,"helmet_url",e.target.value)} placeholder="Helmet image URL" style={input}/></td>
              <td style={td}><input value={draft.logo_url} onChange={(e)=>updateDraft(team.id,"logo_url",e.target.value)} placeholder="Logo image URL" style={input}/></td>
              <td style={td}><input value={draft.primary_color} onChange={(e)=>updateDraft(team.id,"primary_color",e.target.value)} placeholder="#000000" style={input}/></td>
              <td style={td}><input value={draft.secondary_color} onChange={(e)=>updateDraft(team.id,"secondary_color",e.target.value)} placeholder="#ffffff" style={input}/></td>
              <td style={td}><button onClick={()=>saveTeamAssets(team, draft)} style={button}>Save</button></td>
            </tr>
          );
        })}
      </Table>
    </section>
  );
}

function H2H({ results, search, setSearch }) { const rows=getDirectedH2HRows(results).filter((r)=>JSON.stringify(r).toLowerCase().includes(search.toLowerCase())).sort((a,b)=>a.user.localeCompare(b.user)||a.opp.localeCompare(b.opp)); return <section style={card}><div style={sectionTop}><div><h2 style={sectionTitle}>User vs User H2H</h2><p style={mutedText}>All-time across every recorded season. Current streak is based on the most recent meetings between the two users.</p></div><SearchBox value={search} onChange={setSearch}/></div><Table headers={["User","Opponent","W","L","Record","Current Streak"]}>{rows.map((r)=><tr key={`${r.user}-${r.opp}`} style={trStyle}><td style={teamCell}>{r.user}</td><td style={td}>{r.opp}</td><td style={td}>{r.w}</td><td style={td}>{r.l}</td><td style={td}>{r.w}-{r.l}</td><td style={td}>{r.streak}</td></tr>)}</Table></section>; }
function Rankings({ title, rows }) { return <div style={miniCard}><h3>{title}</h3>{rows.map((r,i)=><div key={r.team} style={miniRow}>#{i+1} {r.team}: <b>{r.total}</b></div>)}</div>; }
function AllAmericans({ rows, teams, addRow, updateRow, deleteRow, rankings, drafts, setDrafts, saveDraft, getDraft }) {
  return (
    <section style={card}>
      <div style={sectionTop}>
        <div>
          <h2 style={sectionTitle}>All-Americans</h2>
          <p style={mutedText}>Mobile-friendly editable cards. Each card saves back to the All-Americans table.</p>
        </div>
        <button onClick={addRow} style={button}>Add</button>
      </div>
      <div style={recognitionGrid}>
        {rows.map((r) => {
          const d = getDraft(drafts, r);
          const team = teams.find((t) => t.id === d.team_id);
          return (
            <div key={r.id} style={recognitionCard}>
              <div style={recognitionHeader}>
                <div>
                  <div style={recognitionKicker}>{d.type || "All-American"}</div>
                  <div style={recognitionPlayer}>{d.player_name || "New Player"}</div>
                  <div style={recognitionMeta}>{d.position || "Position"} • {d.season_year || "Year"}</div>
                </div>
                <div style={recognitionTeamBadge}><TeamLabel team={team} name={team?.name || "Team"} /></div>
              </div>
              <div style={recognitionFormGrid}>
                <label style={fieldLabel}>Type<select value={d.type} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),type:e.target.value}})} style={input}>{ALL_AMERICAN_TYPES.map((x)=><option key={x}>{x}</option>)}</select></label>
                <label style={fieldLabel}>Player<input value={d.player_name} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),player_name:e.target.value}})} style={input}/></label>
                <label style={fieldLabel}>Team<select value={d.team_id} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),team_id:e.target.value}})} style={input}>{teams.map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
                <label style={fieldLabel}>Position<select value={d.position} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),position:e.target.value}})} style={input}>{POSITIONS.map((p)=><option key={p}>{p}</option>)}</select></label>
                <label style={fieldLabel}>Year<select value={String(d.season_year)} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),season_year:e.target.value}})} style={input}>{YEARS.map((y)=><option key={y}>{y}</option>)}</select></label>
              </div>
              <div style={recognitionActions}>
                <button onClick={()=>saveDraft("all_americans",r.id,drafts[r.id], ["season_year"])} style={button}>Save</button>
                <DeleteButton onClick={()=>deleteRow("all_americans",r.id)}/>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
function Awards({ rows, teams, addRow, updateRow, deleteRow, rankings, drafts, setDrafts, saveDraft, getDraft }) {
  return (
    <section style={card}>
      <div style={sectionTop}>
        <div>
          <h2 style={sectionTitle}>Awards</h2>
          <p style={mutedText}>Mobile-friendly editable cards with award, player, team, position, and year.</p>
        </div>
        <button onClick={addRow} style={button}>Add</button>
      </div>
      <div style={recognitionGrid}>
        {rows.map((r) => {
          const d = getDraft(drafts, r);
          const team = teams.find((t) => t.id === d.team_id);
          return (
            <div key={r.id} style={recognitionCard}>
              <div style={recognitionHeader}>
                <div>
                  <div style={recognitionKicker}>{d.award_name || "Award"}</div>
                  <div style={recognitionPlayer}>{d.player_name || "New Player"}</div>
                  <div style={recognitionMeta}>{d.position || "Position"} • {d.season_year || "Year"}</div>
                </div>
                <div style={recognitionTeamBadge}><TeamLabel team={team} name={team?.name || "Team"} /></div>
              </div>
              <div style={recognitionFormGrid}>
                <label style={fieldLabel}>Award<select value={d.award_name} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),award_name:e.target.value}})} style={input}>{AWARD_NAMES.map((a)=><option key={a}>{a}</option>)}</select></label>
                <label style={fieldLabel}>Player<input value={d.player_name} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),player_name:e.target.value}})} style={input}/></label>
                <label style={fieldLabel}>Team<select value={d.team_id} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),team_id:e.target.value}})} style={input}>{teams.map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
                <label style={fieldLabel}>Position<select value={d.position} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),position:e.target.value}})} style={input}>{POSITIONS.map((p)=><option key={p}>{p}</option>)}</select></label>
                <label style={fieldLabel}>Year<select value={String(d.season_year)} onChange={(e)=>setDrafts({...drafts,[r.id]:{...(drafts[r.id]||{}),season_year:e.target.value}})} style={input}>{YEARS.map((y)=><option key={y}>{y}</option>)}</select></label>
              </div>
              <div style={recognitionActions}>
                <button onClick={()=>saveDraft("awards",r.id,drafts[r.id], ["season_year"])} style={button}>Save</button>
                <DeleteButton onClick={()=>deleteRow("awards",r.id)}/>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
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
  const primaryColor = team.primary_color || "#18181b";
  const secondaryColor = team.secondary_color || "#ffffff";
  const teamPageStyle = {
    ...card,
    background: primaryColor,
    color: secondaryColor,
    border: `1px solid ${secondaryColor}`,
  };
  const teamSectionTitle = { ...sectionTitle, color: secondaryColor };
  const teamCoachBanner = { ...coachBanner, color: secondaryColor, border: `1px solid ${secondaryColor}` };
  const teamCoachNameStyle = { ...coachNameStyle, color: secondaryColor };

  return <section style={teamPageStyle}><h2 style={teamSectionTitle}><TeamLabel team={team} /></h2><div style={teamCoachBanner}><div><div style={statTitle}>Current Discord User / Coach</div><div style={teamCoachNameStyle}>{coachName}</div></div><div><div style={statTitle}>Program Page</div><div style={mutedText}>Team history and coach profile combined.</div></div></div><div style={statsGrid}><Stat title="Overall" value={`${stat.wins??0}-${stat.losses??0}`}/><Stat title="Avg PF" value={rec.avgPf}/><Stat title="Avg PA" value={rec.avgPa}/><Stat title="Top 25" value={top25Wins(team.id, results)}/><Stat title="Top 25 Class" value={recruiting.filter((r)=>Number(r.rank) >= 1 && Number(r.rank) <= 25).length}/><Stat title="Awards" value={awards.length}/><Stat title="All-Americans" value={allAmericans.length}/><Stat title="Heismans" value={heismans.length}/><Stat title="Conf Titles" value={titleCount(team.id, results, "Conference Championship Week")}/><Stat title="Nattys" value={titleCount(team.id, results, "National Championship Week")}/><Stat title="Bowl" value={`${bowl.wins}-${bowl.losses}`}/><Stat title="SOR" value={strengthOfResult(team.id, teams, allResults)}/></div><div style={twoCol}><div style={miniCard}><h3>Recruiting Rankings</h3><div style={formGrid}><input placeholder="Year" value={newRecruiting.season_year} onChange={(e)=>setNewRecruiting({...newRecruiting,season_year:e.target.value})} style={input}/><input placeholder="Rank" value={newRecruiting.rank} onChange={(e)=>setNewRecruiting({...newRecruiting,rank:e.target.value})} style={input}/><button onClick={()=>addRecruiting(team.id)} style={button}>Add</button></div>{recruiting.map((r)=><div key={r.id} style={miniRow}>{r.season_year}: #{r.rank} <DeleteButton onClick={()=>deleteRow("recruiting_classes",r.id)}/></div>)}</div><div style={miniCard}><h3>History</h3><div style={formGrid}><input placeholder="Year" value={newHistory.season_year} onChange={(e)=>setNewHistory({...newHistory,season_year:e.target.value})} style={input}/><input placeholder="Record" value={newHistory.record} onChange={(e)=>setNewHistory({...newHistory,record:e.target.value})} style={input}/><button onClick={()=>addHistory(team.id)} style={button}>Add</button></div>{historyRows.map((r)=><div key={r.id} style={miniRow}><input value={r.season_year} onChange={(e)=>updateRow("team_history_records",r.id,"season_year",Number(e.target.value))} style={smallInput}/><input value={r.record || ""} onChange={(e)=>updateRow("team_history_records",r.id,"record",e.target.value)} style={smallInput}/><DeleteButton onClick={()=>deleteRow("team_history_records",r.id)}/></div>)}</div></div><Results rows={results} deleteResult={()=>{}} search="" setSearch={()=>{}}/><div style={twoCol}><MiniList title="All-Americans" rows={allAmericans.map((r)=>`${r.player_name} — ${r.type}, ${r.position}, ${r.season_year}`)}/><MiniList title="Awards" rows={awards.map((r)=>`${r.player_name} — ${r.award_name}, ${r.position}, ${r.season_year}`)}/><MiniList title="Heisman Winners" rows={heismans.map((r)=>`${r.player_name} — ${r.position}, ${r.season_year}`)}/></div></section>;
}
function MiniList({ title, rows }) { return <div style={miniCard}><h3>{title}</h3>{rows.map((r,i)=><div key={i} style={miniRow}>{r}</div>)}</div>; }
function Table({ headers, children }) { return <div style={{overflowX:"auto",marginTop:20}}><table style={table}><thead><tr>{headers.map((h, index)=><th key={typeof h === "string" ? h : index} style={th}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
function DeleteButton({ onClick }) { return <button onClick={onClick} style={deleteButton}>Delete</button>; }

const page={minHeight:"100vh",width:"100%",background:"radial-gradient(circle at top left, #2e1065 0, #0f1020 34%, #050509 100%)",color:"white",overflowX:"hidden",fontFamily:"Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"};
const container={width:"100%",maxWidth:"none",margin:0,padding:"clamp(14px, 2vw, 28px)",boxSizing:"border-box"};
const header={display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24,flexWrap:"wrap",gap:20,background:"linear-gradient(135deg, rgba(88,28,135,.55), rgba(15,23,42,.8))",border:"1px solid rgba(250,204,21,.35)",borderRadius:28,padding:"clamp(14px, 2vw, 24px)",boxShadow:"0 24px 80px rgba(0,0,0,.35)"};
const brandWrap={display:"flex",flexDirection:"column",alignItems:"flex-start",gap:8,minWidth:0};
const headerLogo={width:"clamp(170px, 28vw, 340px)",height:"auto",display:"block",objectFit:"contain",filter:"drop-shadow(0 16px 32px rgba(0,0,0,.45))"};
const title={fontSize:"clamp(34px, 5vw, 64px)",fontWeight:950,margin:0,color:"#fff7ed",letterSpacing:"-.04em",textShadow:"0 0 28px rgba(250,204,21,.18)"};
const subtitle={marginTop:8,color:"#d6d3d1",fontSize:16};
const statusBox={background:"linear-gradient(135deg,#facc15,#b45309)",border:"1px solid #fde68a",padding:"12px 20px",borderRadius:999,fontWeight:900,color:"#111827",cursor:"pointer",boxShadow:"0 10px 30px rgba(250,204,21,.18)"};
const tabScroller={overflowX:"auto",background:"rgba(15,16,32,.86)",border:"1px solid rgba(250,204,21,.18)",borderRadius:20,padding:10,marginBottom:24,position:"sticky",top:0,zIndex:10,backdropFilter:"blur(12px)"};
const tabRow={display:"flex",gap:8,width:"max-content"};
const tabStyle={background:"rgba(30,27,75,.65)",color:"#e5e7eb",border:"1px solid rgba(255,255,255,.1)",borderRadius:14,padding:"10px 14px",fontWeight:800,cursor:"pointer",whiteSpace:"nowrap"};
const activeTabStyle={...tabStyle,background:"linear-gradient(135deg,#6d28d9,#facc15)",border:"1px solid #fde68a",color:"#111827"};
const statsGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:20,marginBottom:32};
const statCard={background:"linear-gradient(180deg, rgba(30,27,75,.78), rgba(12,12,18,.92))",border:"1px solid rgba(250,204,21,.16)",borderRadius:22,padding:24,boxShadow:"0 14px 45px rgba(0,0,0,.28)"};
const statTitle={color:"#c4b5fd",fontSize:12,marginBottom:10,textTransform:"uppercase",letterSpacing:".08em",fontWeight:900};
const statValue={fontSize:38,fontWeight:950,color:"#fff7ed"};
const statInput={...statValue,background:"transparent",color:"white",border:"none",outline:"none",width:"100%"};
const statSelect={background:"#111827",color:"#fff7ed",border:"1px solid rgba(250,204,21,.25)",borderRadius:12,padding:14,fontSize:24,fontWeight:900,width:"100%"};
const card={background:"linear-gradient(180deg, rgba(20,20,32,.96), rgba(10,10,18,.98))",border:"1px solid rgba(250,204,21,.18)",borderRadius:26,padding:"clamp(18px, 2vw, 28px)",marginBottom:32,boxShadow:"0 20px 80px rgba(0,0,0,.34)"};
const sectionTop={display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,flexWrap:"wrap"};
const sectionTitle={fontSize:"clamp(25px, 3vw, 36px)",fontWeight:950,margin:0,color:"#fff7ed",letterSpacing:"-.03em"};
const formGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:16,marginTop:20};
const input={background:"rgba(17,24,39,.92)",border:"1px solid rgba(255,255,255,.12)",color:"#fff7ed",padding:14,borderRadius:12,fontSize:15,width:"100%",boxSizing:"border-box"};
const smallInput={...input,width:"120px",marginRight:8};
const searchInput={...input,maxWidth:320};
const button={background:"linear-gradient(135deg,#7c3aed,#facc15)",color:"#111827",border:"none",borderRadius:12,padding:14,fontWeight:900,cursor:"pointer"};
const sortButton={background:"transparent",border:"none",color:"#c4b5fd",fontSize:13,textTransform:"uppercase",fontWeight:900,cursor:"pointer",padding:0};
const deleteButton={background:"#7f1d1d",color:"white",border:"1px solid #ef4444",borderRadius:10,padding:"8px 10px",cursor:"pointer"};
const table={width:"100%",borderCollapse:"separate",borderSpacing:0,minWidth:820};
const th={textAlign:"left",padding:"14px 10px",color:"#c4b5fd",fontSize:12,textTransform:"uppercase",borderBottom:"1px solid rgba(250,204,21,.16)",letterSpacing:".06em"};
const trStyle={borderBottom:"1px solid rgba(255,255,255,.08)"};
const td={padding:"16px 10px",color:"inherit",verticalAlign:"middle"};
const teamCell={...td,color:"#facc15",fontWeight:800};
const clickableTeamCell={...teamCell,cursor:"pointer",textDecoration:"underline"};
const mutedText={color:"#d6d3d1",marginTop:8,marginBottom:0};
const errorBox={background:"rgba(127,29,29,.85)",border:"1px solid #ef4444",color:"white",padding:"14px 18px",borderRadius:14,marginBottom:20};
const bracketGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(260px, 1fr))",gap:16,marginTop:20};
const gameCard={display:"grid",gap:10,border:"1px solid rgba(255,255,255,.1)",borderRadius:16,padding:14,background:"rgba(7,7,12,.75)",marginBottom:14};
const twoCol={display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(320px, 1fr))",gap:20,marginTop:24};
const twoColWide={display:"grid",gridTemplateColumns:"minmax(0, 3fr) minmax(280px, 1fr)",gap:20,marginTop:20};
const miniCard={background:"rgba(7,7,12,.72)",border:"1px solid rgba(250,204,21,.14)",borderRadius:18,padding:18};
const miniRow={borderBottom:"1px solid rgba(255,255,255,.08)",padding:"10px 0",color:"#e4e4e7"};
const miniTitle={marginTop:0,color:"#facc15"};
const recognitionGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(min(100%, 360px), 1fr))",gap:18,marginTop:22};
const recognitionCard={background:"linear-gradient(180deg, rgba(30,27,75,.72), rgba(7,7,12,.9))",border:"1px solid rgba(250,204,21,.18)",borderRadius:22,padding:18,boxShadow:"0 14px 40px rgba(0,0,0,.28)",overflow:"hidden"};
const recognitionHeader={display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:14,borderBottom:"1px solid rgba(255,255,255,.08)",paddingBottom:14,marginBottom:14,flexWrap:"wrap"};
const recognitionKicker={color:"#facc15",fontSize:12,fontWeight:950,textTransform:"uppercase",letterSpacing:".08em",marginBottom:6};
const recognitionPlayer={fontSize:22,fontWeight:950,color:"#fff7ed",lineHeight:1.05};
const recognitionMeta={color:"#d6d3d1",fontSize:13,marginTop:6};
const recognitionTeamBadge={fontSize:13,color:"#fde68a",maxWidth:220};
const recognitionFormGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(min(100%, 190px), 1fr))",gap:12};
const recognitionActions={display:"flex",justifyContent:"flex-end",gap:10,marginTop:14,flexWrap:"wrap"};
const fieldLabel={display:"grid",gap:6,color:"#c4b5fd",fontSize:11,fontWeight:900,textTransform:"uppercase",letterSpacing:".06em"};
const teamLabel={display:"inline-flex",alignItems:"center",gap:10};
const helmetIcon={width:30,height:30,objectFit:"contain",borderRadius:8,background:"rgba(255,255,255,.08)",padding:2};
const helmetFallback={fontSize:22,lineHeight:1};
const coachBanner={display:"flex",justifyContent:"space-between",gap:20,alignItems:"center",background:"rgba(7,7,12,.75)",border:"1px solid rgba(250,204,21,.16)",borderRadius:18,padding:18,margin:"18px 0 24px",flexWrap:"wrap"};
const coachNameStyle={fontSize:28,fontWeight:900,color:"#facc15"};
const pulseGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:20,marginBottom:32};
const pulseCard={...statCard,background:"linear-gradient(135deg, rgba(49,46,129,.85), rgba(12,12,18,.95))"};
const pulseValue={fontSize:24,fontWeight:950,color:"#facc15"};
const rankCell={...td,fontWeight:950,color:"#facc15"};
const scoreCell={...td,fontWeight:950,color:"#facc15",fontSize:18};
const movementBase={display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:54,borderRadius:999,padding:"6px 10px",fontSize:12,fontWeight:950};
const movementUp={...movementBase,background:"rgba(22,163,74,.18)",color:"#86efac",border:"1px solid rgba(134,239,172,.35)"};
const movementDown={...movementBase,background:"rgba(220,38,38,.18)",color:"#fca5a5",border:"1px solid rgba(252,165,165,.35)"};
const movementNeutral={...movementBase,background:"rgba(255,255,255,.08)",color:"#d6d3d1",border:"1px solid rgba(255,255,255,.14)"};
const leaderRow={display:"flex",justifyContent:"space-between",gap:12,borderBottom:"1px solid rgba(255,255,255,.08)",padding:"11px 0",color:"#f5f5f4"};
const activityList={display:"grid",gap:10,marginTop:18};
const activityItem={background:"rgba(255,255,255,.045)",border:"1px solid rgba(255,255,255,.08)",borderRadius:14,padding:"12px 14px",color:"#f5f5f4"};
const profileCard={...card,background:"linear-gradient(135deg, rgba(49,46,129,.88), rgba(7,7,12,.97))"};
const profileHero={display:"flex",alignItems:"center",justifyContent:"space-between",gap:20,flexWrap:"wrap",marginBottom:20};
const eyebrow={color:"#facc15",textTransform:"uppercase",letterSpacing:".12em",fontSize:12,fontWeight:950};
const profileName={fontSize:"clamp(36px, 5vw, 64px)",margin:"6px 0",fontWeight:950,letterSpacing:"-.05em"};
const hofGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(420px, 1fr))",gap:24,marginTop:24};
const hofCard={background:"linear-gradient(160deg, rgba(88,28,135,.72), rgba(15,23,42,.95) 45%, rgba(69,10,10,.85))",border:"1px solid rgba(250,204,21,.28)",borderRadius:26,padding:24,boxShadow:"0 24px 70px rgba(0,0,0,.38)",minHeight:260,overflow:"hidden"};
const hofTop={display:"grid",gridTemplateColumns:"86px minmax(0,1fr) 120px",gap:16,alignItems:"center"};
const hofTopClean={display:"grid",gridTemplateColumns:"86px minmax(0,1fr)",gap:18,alignItems:"center"};
const hofIconWrap={width:76,height:76,borderRadius:20,display:"grid",placeItems:"center",background:"rgba(0,0,0,.34)",border:"1px solid rgba(255,255,255,.14)",position:"relative"};
const hofIcon={fontSize:42};
const hofTeamImg={width:54,height:54,objectFit:"contain",imageRendering:"pixelated",filter:"drop-shadow(0 8px 14px rgba(0,0,0,.35))"};
const hofMiniLogo={position:"absolute",right:-8,bottom:-8,background:"#111827",border:"1px solid rgba(250,204,21,.35)",borderRadius:10,padding:4};
const hofName={fontSize:"clamp(24px, 2.4vw, 34px)",lineHeight:1.08,margin:"6px 0",fontWeight:950,color:"#fff7ed",overflowWrap:"anywhere"};
const hofScore={background:"rgba(0,0,0,.38)",border:"1px solid rgba(250,204,21,.2)",borderRadius:18,padding:14,textAlign:"center"};
const hofScoreBand={display:"flex",alignItems:"center",justifyContent:"space-between",gap:14,marginTop:18,background:"rgba(0,0,0,.36)",border:"1px solid rgba(250,204,21,.22)",borderRadius:18,padding:"14px 16px",color:"#c4b5fd",textTransform:"uppercase",letterSpacing:".08em",fontSize:12,fontWeight:900};
const hofScoreBandB={fontSize:30,color:"#facc15"};
const hofReason={marginTop:12,color:"#fde68a",fontWeight:800,fontSize:13,lineHeight:1.5};
const hofScoreSpan={color:"#c4b5fd"};
const hofChips={display:"flex",gap:10,flexWrap:"wrap",marginTop:22};
const chip={display:"grid",gap:2,background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.12)",borderRadius:999,padding:"8px 12px",fontSize:12};
const accoladeList={marginTop:16};


const heroBanner = {
  position: "relative",
  minHeight: 300,
  borderRadius: 28,
  overflow: "hidden",
  border: "1px solid rgba(255,199,44,.45)",
  marginBottom: 22,
  background: "#080814",
  boxShadow: "0 20px 50px rgba(0,0,0,.45)",
};

const heroBannerImage = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
  objectPosition: "center",
  opacity: 0.35,
};

const heroOverlay = {
  position: "absolute",
  inset: 0,
  background: "linear-gradient(90deg, rgba(20,8,45,.92), rgba(20,8,45,.62), rgba(5,5,15,.88))",
};

const heroContent = {
  position: "relative",
  zIndex: 2,
  minHeight: 300,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 24,
  padding: "34px 42px",
};

const heroTitle = {
  margin: 0,
  fontSize: "clamp(34px, 5vw, 72px)",
  fontWeight: 900,
  letterSpacing: "-2px",
  color: "#fff",
};

const heroSubtitle = {
  marginTop: 10,
  fontSize: "clamp(15px, 2vw, 22px)",
  color: "rgba(255,255,255,.86)",
};
