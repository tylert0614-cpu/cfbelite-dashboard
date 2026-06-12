import React, { useEffect, useMemo, useState } from "react";
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

function getTeamPrimary(team) {
  return team?.primary_color || "#1e1b4b";
}

function getTeamSecondary(team) {
  return team?.secondary_color || "#facc15";
}

function teamPageTheme(team) {
  const primary = getTeamPrimary(team);
  const secondary = getTeamSecondary(team);
  const accent = team?.accent_color || secondary || "#facc15";
  return {
    ...liquidGlassPanel,
    position: "relative",
    overflow: "hidden",
    border: `1px solid ${accent}66`,
    background: `radial-gradient(circle at 8% 0%, ${accent}26, transparent 34%), radial-gradient(circle at 100% 10%, ${secondary}22, transparent 28%), linear-gradient(145deg, ${primary}e8 0%, rgba(15,23,42,.72) 48%, rgba(2,6,23,.90) 100%)`,
    boxShadow: `0 30px 90px ${primary}66, inset 0 1px 0 rgba(255,255,255,.18)`,
  };
}

function TeamWatermark({ team }) {
  const url = team?.logo_url || team?.helmet_url;
  if (!url) return null;
  return <img src={url} alt="" style={teamWatermark}/>;
}

function ChampionshipRings({ count = 0 }) {
  const safe = Math.min(Number(count) || 0, 12);
  if (!safe) return <span style={mutedText}>No rings yet</span>;
  return <span style={ringRow}>{Array.from({length:safe}, (_,i)=><span key={i} title="National Championship">💍</span>)}</span>;
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

function assignmentActiveForYear(assignment, year) {
  const y = Number(year);
  const start = Number(assignment.start_year || 0);
  const end = assignment.end_year ? Number(assignment.end_year) : 9999;
  return assignment.status === "Active" && y >= start && y <= end;
}

function activeAssignmentsForYear(assignments, year) {
  return assignments.filter((assignment) => assignmentActiveForYear(assignment, year));
}

function activeTeamIdsForYear(assignments, year) {
  return new Set(activeAssignmentsForYear(assignments, year).map((assignment) => assignment.team_id).filter(Boolean));
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


function isErrorMessage(message) {
  const value = String(message || "").toLowerCase();
  return value.includes("failed") ||
    value.includes("error") ||
    value.includes("incorrect") ||
    value.includes("missing") ||
    value.includes("required") ||
    value.includes("not found") ||
    value.includes("could not");
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
  const [weeklyMatchups, setWeeklyMatchups] = useState([]);
  const [draftPicks27, setDraftPicks27] = useState([]);
  const [draftSettings27, setDraftSettings27] = useState({ id: 1, current_pick: 1, timer_minutes: 10, is_live: false, paused: false });
  const [newWeeklyMatchup, setNewWeeklyMatchup] = useState({
    season_year: 2029,
    week: "Week 1",
    team_1_id: "",
    team_2_id: "",
    team_1_user_id: "",
    team_2_user_id: "",
  });
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminCodeInput, setAdminCodeInput] = useState("");
  const [matchupImportText, setMatchupImportText] = useState("");

  const teamOptions = useMemo(() => [...teams].sort((a, b) => a.name.localeCompare(b.name)), [teams]);
  const userOptions = useMemo(() => [...users].sort((a, b) => a.discord_username.localeCompare(b.discord_username)), [users]);
  const activeTeamIds = useMemo(
    () => activeTeamIdsForYear(assignments, currentYear),
    [assignments, currentYear]
  );
  const activeTeamOptions = useMemo(() => teamOptions.filter((team) => activeTeamIds.has(team.id)), [teamOptions, activeTeamIds]);
  const selectedTeam = activeTab.startsWith("team-") ? teams.find((team) => `team-${team.id}` === activeTab) : null;
  const activeCoachUsers = useMemo(() => {
    const activeUserIds = new Set(
      assignments
        .filter((assignment) => assignment.status === "Active" && assignment.discord_user_id)
        .map((assignment) => assignment.discord_user_id)
    );
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

  const baseTabs = [["dashboard","Dashboard"],["draftRoom","CFBElite 27 Draft Room"],["commissionerCenter","Commissioner Center"],["weeklyMatchups","Weekly Matchups"],["recruitingRankings","Recruiting Rankings"],["dynastyTimeline","Dynasty Timeline"],["dynastyRecords","League Records"],["rivalries","Rivalries"],["powerIndex","Power Index"],["eloRankings","User ELO"],["conferencePower","Conference Power"],["coachHOF","Coach Hall of Fame"],["playerHOF","Player Hall of Fame"],["assignments","Users/Team Assignments"],["h2h","User vs User H2H"],["allAmericans","All-Americans"],["awards","Awards"],["heismans","Heisman Winners"],["nationalChampions","National Champions"],...activeCoachUsers.map((user) => [`coach-${user.id}`, user.discord_username])];
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
    const [teamsRes, settingsRes, tabOrderRes, usersRes, assignmentsRes, standingsRes, rankingsRes, resultsRes, weeklyMatchupsRes, draftPicks27Res, draftSettings27Res, aaRes, awardsRes, heismanRes, championsRes, draftRes, playoffRes, recruitingRes, historyRes] = await Promise.all([
      supabase.from("teams").select("*").order("name"),
      supabase.from("league_settings").select("*").eq("id", 1).single(),
      supabase.from("dashboard_tab_order").select("*").eq("id", 1).single(),
      supabase.from("discord_users").select("*").order("discord_username"),
      supabase.from("team_assignments").select("*, teams(name), discord_users(discord_username)").order("created_at"),
      supabase.from("team_standings").select("*").order("team_name"),
      supabase.from("commissioner_rankings").select("*").order("rank"),
      supabase.from("game_results").select(`*, team_1:teams!game_results_team_1_id_fkey(*), team_2:teams!game_results_team_2_id_fkey(*), user_1:discord_users!game_results_team_1_user_id_fkey(discord_username), user_2:discord_users!game_results_team_2_user_id_fkey(discord_username)`).order("created_at", { ascending: false }),
      supabase.from("weekly_matchups").select(`*, team_1:teams!weekly_matchups_team_1_id_fkey(*), team_2:teams!weekly_matchups_team_2_id_fkey(*), user_1:discord_users!weekly_matchups_team_1_user_id_fkey(discord_username), user_2:discord_users!weekly_matchups_team_2_user_id_fkey(discord_username)`).order("created_at", { ascending: false }),
      supabase.from("cfb27_draft_picks").select("*, teams(*), discord_users(discord_username)").order("pick_number"),
      supabase.from("cfb27_draft_settings").select("*").eq("id", 1).single(),
      supabase.from("all_americans").select("*, teams(name)").order("season_year", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("awards").select("*, teams(name)").order("season_year", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("heisman_winners").select("*, teams(name)").order("season_year", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("national_champions").select("*, teams(name), discord_users(discord_username)").order("season_year", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("draft_order_27").select("*, discord_users(discord_username)").order("pick_number"),
      supabase.from("playoff_games").select(`*, top_team:teams!playoff_games_top_team_id_fkey(name), bottom_team:teams!playoff_games_bottom_team_id_fkey(name)`).order("sort_order"),
      supabase.from("recruiting_classes").select("*, teams(name)").order("season_year", { ascending: false }),
      supabase.from("team_history_records").select("*, teams(name)").order("season_year", { ascending: false }),
    ]);
    const firstError = [teamsRes, settingsRes, tabOrderRes, usersRes, assignmentsRes, standingsRes, rankingsRes, resultsRes, weeklyMatchupsRes, draftPicks27Res, draftSettings27Res, aaRes, awardsRes, heismanRes, championsRes, draftRes, playoffRes, recruitingRes, historyRes].find((r) => r.error)?.error;
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
        setNewWeeklyMatchup((prev) => ({
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
      setResults(resultsRes.data || []); setWeeklyMatchups(weeklyMatchupsRes.data || []); setDraftPicks27(draftPicks27Res.data || []); if (draftSettings27Res.data) setDraftSettings27(draftSettings27Res.data); setAllAmericans(aaRes.data || []); setAwards(awardsRes.data || []); setHeismans(heismanRes.data || []); setNationalChampions(championsRes.data || []); setDraftOrder(draftRes.data || []); setPlayoffGames(playoffRes.data || []); setRecruiting(recruitingRes.data || []);
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

  async function addWeeklyMatchup() {
    if (!newWeeklyMatchup.team_1_id || !newWeeklyMatchup.team_2_id) {
      setError("Select both teams before adding a weekly matchup.");
      return;
    }

    const { error: insertError } = await supabase.from("weekly_matchups").insert({
      season_year: Number(newWeeklyMatchup.season_year || currentYear),
      week: newWeeklyMatchup.week || currentWeek,
      team_1_id: newWeeklyMatchup.team_1_id,
      team_2_id: newWeeklyMatchup.team_2_id,
      team_1_user_id: newWeeklyMatchup.team_1_user_id || null,
      team_2_user_id: newWeeklyMatchup.team_2_user_id || null,
    });

    if (insertError) {
      setError(`Weekly matchup add failed: ${insertError.message}`);
      return;
    }

    setNewWeeklyMatchup({ season_year: Number(currentYear), week: currentWeek, team_1_id: "", team_2_id: "", team_1_user_id: "", team_2_user_id: "" });
    setError("");
    await loadData();
  }

  function normalizeName(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  async function importWeeklyMatchups() {
    const lines = matchupImportText.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!lines.length) {
      setError("Paste at least one matchup line first.");
      return;
    }

    const payload = [];
    const teamLookup = new Map(teamOptions.map((team) => [normalizeName(team.name), team]));
    const userLookup = new Map(userOptions.map((user) => [normalizeName(user.discord_username), user]));

    lines.forEach((line) => {
      const cleanLine = line
        .replace(/\s+at\s+/i, " vs ")
        .replace(/\s+@\s+/i, " vs ")
        .replace(/\s+v\.\s+/i, " vs ")
        .replace(/\s+versus\s+/i, " vs ");
      const [left, right] = cleanLine.split(/\s+vs\s+/i).map((part) => part?.trim());
      if (!left || !right) return;

      const findTeam = (text) => {
        const normalized = normalizeName(text);
        return teamOptions.find((team) => normalized.includes(normalizeName(team.name)) || normalizeName(team.name).includes(normalized));
      };
      const findUser = (text) => {
        const normalized = normalizeName(text);
        return userOptions.find((user) => normalized.includes(normalizeName(user.discord_username)) || normalizeName(user.discord_username).includes(normalized));
      };

      const team1 = findTeam(left);
      const team2 = findTeam(right);
      const user1 = findUser(left);
      const user2 = findUser(right);

      if (team1 && team2) {
        payload.push({
          season_year: Number(currentYear),
          week: currentWeek,
          team_1_id: team1.id,
          team_2_id: team2.id,
          team_1_user_id: user1?.id || activeCoachForTeam(team1.id, assignments)?.discord_user_id || null,
          team_2_user_id: user2?.id || activeCoachForTeam(team2.id, assignments)?.discord_user_id || null,
        });
      }
    });

    if (!payload.length) {
      setError("No matchups could be matched. Use lines like: Alabama Crimson Tide vs Clemson Tigers.");
      return;
    }

    const { error: importError } = await supabase.from("weekly_matchups").insert(payload);
    if (importError) {
      setError(`Weekly matchup import failed: ${importError.message}`);
      return;
    }

    setMatchupImportText("");
    setError(`Imported ${payload.length} weekly matchup${payload.length === 1 ? "" : "s"}.`);
    await loadData();
  }

  function unlockAdmin() {
    const expected = import.meta.env.VITE_ADMIN_CODE || "cfbelite";
    if (adminCodeInput === expected) {
      setAdminUnlocked(true);
      setAdminCodeInput("");
      setError("");
    } else {
      setError("Incorrect commissioner code.");
    }
  }

  return <><GlobalStyle/><div style={page}><div style={container}><Header loading={loading} reload={loadData}/>{error && <div style={isErrorMessage(error) ? errorBox : successBox}>{error}</div>}<TabBar tabs={tabs} activeTab={activeTab} setActiveTab={setActiveTab} draggedTab={draggedTab} setDraggedTab={setDraggedTab} reorderTabs={reorderTabs} teams={teamOptions} assignments={assignments} currentYear={currentYear}/>
    {activeTab === "draftRoom" && <DraftRoom teams={teamOptions} users={userOptions} picks={draftPicks27} settings={draftSettings27} startClock={startDraftClock} pauseClock={pauseDraftClock} resumeClock={resumeDraftClock} announcePick={announceDraftPick} revealPick={revealDraftPick} undoPick={undoDraftPick}/>}     
    {activeTab === "dashboard" && <><QuickJump teams={activeTeamOptions} users={activeCoachUsers} setActiveTab={setActiveTab}/><DataHealthAlerts teams={teamOptions} users={userOptions} assignments={assignments} results={results}/><HeadlineTicker teams={activeTeamOptions} users={userOptions} assignments={assignments} results={currentYearResults} allResults={results} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting} currentYear={currentYear} currentWeek={currentWeek}/><Stats currentYear={currentYear} setCurrentYear={(value)=>{setCurrentYear(value); setNewResult((prev)=>({...prev, season_year: Number(value)}));}} currentWeek={currentWeek} setCurrentWeek={(value)=>{setCurrentWeek(value); setNewResult((prev)=>({...prev, week: value}));}} teams={activeTeamOptions} assignments={assignments} saveSettings={saveLeagueSettings}/><LeaguePulse teams={activeTeamOptions} results={currentYearResults} allAmericans={allAmericans} awards={awards} currentYear={currentYear} assignments={assignments} users={userOptions}/><GameOfTheWeekDashboard teams={activeTeamOptions} users={userOptions} assignments={assignments} results={currentYearResults} weeklyMatchups={weeklyMatchups} currentYear={currentYear} currentWeek={currentWeek}/><DynastyHeadlines teams={activeTeamOptions} users={userOptions} assignments={assignments} results={currentYearResults} allResults={results} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting} currentYear={currentYear} currentWeek={currentWeek}/><Watchlist teams={activeTeamOptions} users={userOptions} assignments={assignments} results={currentYearResults} currentWeek={currentWeek}/><MilestoneTracker users={userOptions} teams={teamOptions} assignments={assignments} results={results}/><ComputerRankings teams={activeTeamOptions} results={currentYearResults} currentWeek={currentWeek} sortState={userSort} setSortState={setUserSort} assignments={assignments} users={userOptions}/><DashboardRecognition allAmericanRows={rankingRows(activeTeamOptions, allAmericans)} awardRows={rankingRows(activeTeamOptions, awards)}/><RecordResult newResult={newResult} setNewResult={setNewResult} teams={activeTeamOptions} users={userOptions} assignments={assignments} submitResult={submitResult}/></>}
    {activeTab === "eloRankings" && <EloRankings users={userOptions} teams={teamOptions} assignments={assignments} results={results}/>}    
    {activeTab === "dynastyRecords" && <DynastyRecords users={userOptions} teams={teamOptions} assignments={assignments} results={results} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting}/>}    
    {activeTab === "rivalries" && <Rivalries users={userOptions} teams={teamOptions} assignments={assignments} results={results}/>}    
    {activeTab === "powerIndex" && <DynastyPowerIndex users={userOptions} teams={teamOptions} assignments={assignments} results={results} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting}/>}
    {activeTab === "commissionerCenter" && (adminUnlocked ? <CommissionerCenter currentYear={currentYear} currentWeek={currentWeek} setActiveTab={setActiveTab} saveLeagueSettings={saveLeagueSettings} loadData={loadData} teams={teamOptions} users={userOptions} assignments={assignments} results={results} awards={awards} allAmericans={allAmericans} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting}/> : <AdminLocked/>) }    
    {activeTab === "conferencePower" && <ConferencePowerRankings teams={activeTeamOptions} users={userOptions} assignments={assignments} results={currentYearResults} allResults={results} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting}/>}    
    {activeTab === "weeklyMedia" && <WeeklyMedia teams={activeTeamOptions} users={userOptions} assignments={assignments} results={currentYearResults} allResults={results} weeklyMatchups={weeklyMatchups} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting} currentYear={currentYear} currentWeek={currentWeek}/>}    
    {activeTab === "weeklyMatchups" && (adminUnlocked ? <WeeklyMatchups rows={weeklyMatchups} newMatchup={newWeeklyMatchup} setNewMatchup={setNewWeeklyMatchup} teams={activeTeamOptions} users={userOptions} assignments={assignments} results={currentYearResults} currentYear={currentYear} currentWeek={currentWeek} addMatchup={addWeeklyMatchup} deleteRow={deleteRow} matchupImportText={matchupImportText} setMatchupImportText={setMatchupImportText} importWeeklyMatchups={importWeeklyMatchups}/> : <AdminLocked/>) }    
    {activeTab === "recruitingRankings" && <RecruitingRankings rows={recruiting} teams={teamOptions} users={userOptions} assignments={assignments} currentYear={currentYear}/>}    
    {activeTab === "dynastyTimeline" && <DynastyTimeline results={results} teams={teamOptions} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting}/>}
    {activeTab === "coachHOF" && <CoachHallOfFame users={userOptions} teams={teamOptions} assignments={assignments} results={results} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting}/>}    
    {activeTab === "playerHOF" && <PlayerHallOfFame teams={teamOptions} assignments={assignments} results={results} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions}/>}    
    {activeTab === "assignments" && (adminUnlocked ? <Assignments rows={assignments} teams={teamOptions} users={userOptions} currentYear={currentYear} addAssignment={addAssignment} updateRow={updateRow} deleteRow={deleteRow} drafts={draftAssignments} setDrafts={setDraftAssignments} saveDraft={saveDraft} getDraft={getDraft} teamChange={teamChange} setTeamChange={setTeamChange} changeUserTeam={changeUserTeam}/> : <AdminLocked/>) }    
    {activeTab === "h2h" && <H2H results={results} search={search.h2h} setSearch={(v)=>setSearch({...search,h2h:v})}/>}    
    {activeTab === "allAmericans" && <AllAmericans rows={allAmericans} teams={teamOptions} addRow={addAA} updateRow={updateRow} deleteRow={deleteRow} rankings={[]} drafts={draftAllAmericans} setDrafts={setDraftAllAmericans} saveDraft={saveDraft} getDraft={getDraft}/>}    
    {activeTab === "awards" && <Awards rows={awards} teams={teamOptions} addRow={addAward} updateRow={updateRow} deleteRow={deleteRow} rankings={[]} drafts={draftAwards} setDrafts={setDraftAwards} saveDraft={saveDraft} getDraft={getDraft}/>}    
    {activeTab === "heismans" && <Heismans rows={heismans} teams={teamOptions} addRow={addHeisman} updateRow={updateRow} deleteRow={deleteRow} drafts={draftHeismans} setDrafts={setDraftHeismans} saveDraft={saveDraft} getDraft={getDraft}/>}    
    {activeTab === "nationalChampions" && <NationalChampions rows={nationalChampions} teams={teamOptions} users={userOptions} addRow={addNationalChampion} updateRow={updateRow} deleteRow={deleteRow} drafts={draftChampions} setDrafts={setDraftChampions} saveDraft={saveDraft} getDraft={getDraft}/>}        
    {selectedCoach && <CoachProfile user={selectedCoach} users={userOptions} teams={teamOptions} assignments={assignments} results={results} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting}/>}    
  </div></div></>;
}




function matchupUserLabel(userId, users) {
  return users.find((user) => user.id === userId)?.discord_username || "Unassigned";
}

function matchupScore(row, teams, users, assignments, results) {
  const t1 = teams.find((team) => team.id === row.team_1_id) || row.team_1;
  const t2 = teams.find((team) => team.id === row.team_2_id) || row.team_2;
  if (!t1 || !t2) return { score: 0, reasons: ["Missing team data"] };

  const rankings = computerRankingRows(teams, results, assignments, users);
  const rankMap = new Map(rankings.map((item) => [item.team.id, item.rank]));
  const t1Rank = rankMap.get(t1.id) || 32;
  const t2Rank = rankMap.get(t2.id) || 32;
  const combinedRankValue = Math.max(0, 100 - ((t1Rank + t2Rank - 2) * 2.1));

  const team1UserId = row.team_1_user_id || coachForTeamYear(t1.id, row.season_year, assignments)?.discord_user_id;
  const team2UserId = row.team_2_user_id || coachForTeamYear(t2.id, row.season_year, assignments)?.discord_user_id;
  const userRows = allTimeUserRankingRows(users, teams, assignments, results);
  const userRankMap = new Map(userRows.map((item, index) => [item.user.id, index + 1]));
  const u1Rank = userRankMap.get(team1UserId) || 32;
  const u2Rank = userRankMap.get(team2UserId) || 32;
  const userTierValue = ((u1Rank <= 8 ? 100 : u1Rank <= 16 ? 75 : u1Rank <= 24 ? 50 : 25) + (u2Rank <= 8 ? 100 : u2Rank <= 16 ? 75 : u2Rank <= 24 ? 50 : 25)) / 2;

  const r1 = recordFromResults(t1.id, results);
  const r2 = recordFromResults(t2.id, results);
  const recordValue = ((r1.wins + r2.wins) * 5) + Math.max(0, 20 - ((r1.losses + r2.losses) * 2));
  const rankedBonus = t1Rank <= 25 && t2Rank <= 25 ? 10 : t1Rank <= 25 || t2Rank <= 25 ? 5 : 0;
  const topTierBonus = u1Rank <= 8 && u2Rank <= 8 ? 12 : u1Rank <= 16 && u2Rank <= 16 ? 6 : 0;

  const score = Math.min(100, (combinedRankValue * 0.38) + (userTierValue * 0.32) + (recordValue * 0.18) + rankedBonus + topTierBonus);
  const reasons = [];
  if (t1Rank <= 25 && t2Rank <= 25) reasons.push("ranked matchup");
  if (u1Rank <= 8 && u2Rank <= 8) reasons.push("two top-tier users");
  else if (u1Rank <= 16 && u2Rank <= 16) reasons.push("strong user matchup");
  if (r1.wins + r2.wins >= 8) reasons.push("strong combined record");
  if (rankedBonus) reasons.push("poll implications");
  return { score: Number(score.toFixed(1)), reasons: reasons.length ? reasons : ["best available matchup"], t1Rank, t2Rank, u1Rank, u2Rank };
}

function weeklyMatchupRows(rows, teams, users, assignments, results, currentYear, currentWeek) {
  return rows
    .filter((row) => String(row.season_year) === String(currentYear) && row.week === currentWeek)
    .map((row) => ({ ...row, game: matchupScore(row, teams, users, assignments, results) }))
    .sort((a,b) => b.game.score - a.game.score);
}

function GameOfTheWeekDashboard({ teams, users, assignments, results, weeklyMatchups, currentYear, currentWeek }) {
  const rows = weeklyMatchupRows(weeklyMatchups, teams, users, assignments, results, currentYear, currentWeek);
  const game = rows[0];
  if (!game) return <section style={card}><h2 style={sectionTitle}>🔥 Game of the Week</h2><p style={mutedText}>No weekly matchups entered for {currentYear} {currentWeek} yet.</p></section>;
  return <section style={card}><h2 style={sectionTitle}>🔥 Game of the Week</h2><div style={gotwCard}><div style={gotwTeam}><TeamLabel team={game.team_1 || teams.find((t)=>t.id===game.team_1_id)}/><span>{game.user_1?.discord_username || matchupUserLabel(game.team_1_user_id, users)}</span></div><div style={gotwScore}>{game.game.score}</div><div style={gotwTeam}><TeamLabel team={game.team_2 || teams.find((t)=>t.id===game.team_2_id)}/><span>{game.user_2?.discord_username || matchupUserLabel(game.team_2_user_id, users)}</span></div></div><p style={mutedText}>Why: {game.game.reasons.join(" • ")}</p></section>;
}




function userResultsFor(userId, results, assignments) {
  return results.filter((result) => {
    const team1UserId = result.team_1_user_id || coachForTeamYear(result.team_1_id, result.season_year, assignments)?.discord_user_id;
    const team2UserId = result.team_2_user_id || coachForTeamYear(result.team_2_id, result.season_year, assignments)?.discord_user_id;
    return team1UserId === userId || team2UserId === userId;
  });
}

function streakFromGames(games, userId, assignments) {
  const ordered = [...games].sort((a,b)=>{
    const yearDiff = Number(a.season_year||0)-Number(b.season_year||0);
    if (yearDiff) return yearDiff;
    const weekDiff = weekIndex(a.week)-weekIndex(b.week);
    if (weekDiff) return weekDiff;
    return new Date(a.created_at||0)-new Date(b.created_at||0);
  });
  let currentType = null;
  let currentCount = 0;
  let bestWin = 0;
  let bestLoss = 0;
  ordered.forEach((result)=>{
    const team1UserId = result.team_1_user_id || coachForTeamYear(result.team_1_id, result.season_year, assignments)?.discord_user_id;
    const isTeam1 = team1UserId === userId;
    const forPts = Number(isTeam1 ? result.team_1_score : result.team_2_score) || 0;
    const againstPts = Number(isTeam1 ? result.team_2_score : result.team_1_score) || 0;
    const type = forPts > againstPts ? "W" : forPts < againstPts ? "L" : "T";
    if (type === currentType) currentCount += 1;
    else { currentType = type; currentCount = 1; }
    if (type === "W") bestWin = Math.max(bestWin, currentCount);
    if (type === "L") bestLoss = Math.max(bestLoss, currentCount);
  });
  return { current: currentType && currentType !== "T" ? `${currentType}${currentCount}` : "—", longestWin: bestWin, longestLoss: bestLoss };
}

function bestAndWorstGames(userId, results, assignments) {
  const games = userResultsFor(userId, results, assignments);
  let best = null;
  let worst = null;

  games.forEach((result)=>{
    const team1UserId = result.team_1_user_id || coachForTeamYear(result.team_1_id, result.season_year, assignments)?.discord_user_id;
    const isTeam1 = team1UserId === userId;
    const forPts = Number(isTeam1 ? result.team_1_score : result.team_2_score) || 0;
    const againstPts = Number(isTeam1 ? result.team_2_score : result.team_1_score) || 0;
    const opponentRank = Number(isTeam1 ? result.team_2_rank : result.team_1_rank) || 99;
    const opponentName = isTeam1 ? result.team_2?.name : result.team_1?.name;
    const margin = forPts - againstPts;
    const bestValue = margin + (opponentRank <= 25 ? (30 - opponentRank) : 0);
    const row = { result, opponentName, forPts, againstPts, margin, bestValue, opponentRank };

    if (margin > 0 && (!best || bestValue > best.bestValue)) best = row;

    if (margin < 0) {
      if (!worst || margin < worst.margin || (margin === worst.margin && opponentRank > worst.opponentRank)) {
        worst = row;
      }
    }
  });

  return { best, worst };
}

function DynastyHeadlines({ teams, users, assignments, results, allResults, allAmericans, awards, heismans, nationalChampions, recruiting, currentYear, currentWeek }) {
  const headlines = [];
  const weekResults = results.filter((row)=>String(row.season_year) === String(currentYear) && row.week === currentWeek);
  const rankings = computerRankingRows(teams, results, assignments, users);
  const eloRows = userEloRows(users, assignments, allResults);
  const topTeam = rankings[0];
  const topUser = eloRows[0];

  weekResults.forEach((row)=>{
    const s1 = Number(row.team_1_score||0), s2 = Number(row.team_2_score||0);
    const winner = s1 >= s2 ? row.team_1 : row.team_2;
    const loser = s1 >= s2 ? row.team_2 : row.team_1;
    const winScore = Math.max(s1,s2);
    const loseScore = Math.min(s1,s2);
    const margin = winScore - loseScore;
    const winnerRank = s1 >= s2 ? row.team_1_rank : row.team_2_rank;
    const loserRank = s1 >= s2 ? row.team_2_rank : row.team_1_rank;

    if (Number(loserRank) > 0 && Number(loserRank) <= 10 && (!winnerRank || Number(winnerRank) > Number(loserRank))) {
      headlines.push(`${winner?.name || "A team"} shook up the league with a ${winScore}-${loseScore} upset over #${loserRank} ${loser?.name || "a ranked opponent"}.`);
    } else if (margin >= 28) {
      headlines.push(`${winner?.name || "A team"} made a statement with a ${margin}-point win over ${loser?.name || "their opponent"}, ${winScore}-${loseScore}.`);
    } else if (margin <= 7) {
      headlines.push(`${winner?.name || "A team"} survived a tight one against ${loser?.name || "their opponent"}, escaping ${winScore}-${loseScore}.`);
    }
  });

  if (topTeam) headlines.push(`${topTeam.teamName} owns the #1 computer ranking at ${topTeam.score}, backed by a ${topTeam.wins}-${topTeam.losses} record and ${topTeam.qw} quality win${topTeam.qw === 1 ? "" : "s"}.`);
  if (topUser) headlines.push(`${topUser.discord} leads the User ELO race with an adjusted ELO of ${topUser.adjustedElo || topUser.elo}.`);
  const riser = rankings.filter((row)=>row.top25 > 0 || row.qw > 0).sort((a,b)=>b.qw-a.qw || b.score-a.score)[0];
  if (riser && riser.teamName !== topTeam?.teamName) headlines.push(`${riser.teamName} continues building a stronger résumé with ${riser.qw} quality win${riser.qw === 1 ? "" : "s"} and a ${riser.wins}-${riser.losses} mark.`);
  const bestClass = recruiting.filter((row)=>String(row.season_year) === String(currentYear) && Number(row.rank)>0).sort((a,b)=>Number(a.rank)-Number(b.rank))[0];
  if (bestClass) headlines.push(`${bestClass.teams?.name || teamNameById(bestClass.team_id, teams)} is setting the recruiting tone with the #${bestClass.rank} class in ${currentYear}.`);
  const currentHeisman = heismans.filter((row)=>String(row.season_year) === String(currentYear))[0];
  if (currentHeisman) headlines.push(`${currentHeisman.player_name} gives ${currentHeisman.teams?.name || teamNameById(currentHeisman.team_id, teams)} a national spotlight as the latest Heisman winner on the board.`);
  if (!headlines.length) headlines.push("Record games, awards, Heismans, and recruiting classes to generate richer league headlines.");

  return <section style={glassCard}><h2 style={sectionTitle}>📰 Dynasty Headlines</h2><div style={headlineList}>{headlines.slice(0,8).map((line,index)=><div key={index} style={headlineItem}>• {line}</div>)}</div></section>;
}

function MilestoneTracker({ users, teams, assignments, results }) {
  const rows = allTimeUserRankingRows(users, teams, assignments, results);
  const milestones = [];
  rows.forEach((row)=>{
    [50,100,150,200,250,300].forEach((target)=>{
      if (row.wins <= target && target - row.wins <= 5) milestones.push({ name: row.discord, text: `${target - row.wins} win${target-row.wins===1?"":"s"} from ${target} career wins` });
    });
    if (row.games && row.games % 50 >= 45) milestones.push({ name: row.discord, text: `${50 - (row.games % 50)} game${50-(row.games%50)===1?"":"s"} from ${Math.ceil(row.games/50)*50} career games` });
  });
  return <section style={card}><h2 style={sectionTitle}>🎯 Milestone Tracker</h2><div style={threeCol}>{milestones.slice(0,9).map((m,i)=><div key={i} style={miniCard}><h3 style={miniTitle}>{m.name}</h3><div style={mutedText}>{m.text}</div></div>)}</div>{!milestones.length && <div style={miniRow}>No milestone alerts right now.</div>}</section>;
}

function Rivalries({ users, teams, assignments, results }) {
  const map = new Map();
  results.forEach((result)=>{
    const u1 = result.team_1_user_id || coachForTeamYear(result.team_1_id, result.season_year, assignments)?.discord_user_id;
    const u2 = result.team_2_user_id || coachForTeamYear(result.team_2_id, result.season_year, assignments)?.discord_user_id;
    if (!u1 || !u2 || u1 === u2) return;
    const ids = [u1,u2].sort();
    const key = ids.join("-");
    if (!map.has(key)) map.set(key, { u1: ids[0], u2: ids[1], games: [], wins: {[ids[0]]:0,[ids[1]]:0}, points: {[ids[0]]:0,[ids[1]]:0}, largest:null });
    const row = map.get(key);
    const s1 = Number(result.team_1_score||0), s2 = Number(result.team_2_score||0);
    row.games.push(result);
    row.points[u1] += s1; row.points[u2] += s2;
    const winner = s1 > s2 ? u1 : s2 > s1 ? u2 : null;
    if (winner) row.wins[winner] += 1;
    const margin = Math.abs(s1-s2);
    if (!row.largest || margin > row.largest.margin) row.largest = { margin, result };
  });
  const userName = (id)=>users.find((u)=>u.id===id)?.discord_username || "Unknown";
  const rows = [...map.values()].filter((row)=>row.games.length >= 2).sort((a,b)=>b.games.length-a.games.length).slice(0,30);
  return <section style={card}><h2 style={sectionTitle}>Rivalries</h2><p style={mutedText}>Automatically built from repeated user-vs-user matchups.</p><Table headers={["Rivalry", "Series", "Points", "Largest Win", "Games"]}>{rows.map((row)=><tr key={`${row.u1}-${row.u2}`} style={trStyle}><td style={teamCell}>{userName(row.u1)} vs {userName(row.u2)}</td><td style={td}>{row.wins[row.u1]}-{row.wins[row.u2]}</td><td style={td}>{row.points[row.u1]}-{row.points[row.u2]}</td><td style={td}>{row.largest?.margin || 0}</td><td style={td}>{row.games.length}</td></tr>)}</Table></section>;
}

function DynastyRecords({ users, teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting }) {
  const coachRows = getCoachStats(users, teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting);
  const records = [
    ["Most Career Wins", coachRows.sort((a,b)=>b.wins-a.wins)[0]?.discord, coachRows.sort((a,b)=>b.wins-a.wins)[0]?.wins],
    ["Most National Titles", coachRows.sort((a,b)=>b.nattys-a.nattys)[0]?.discord, coachRows.sort((a,b)=>b.nattys-a.nattys)[0]?.nattys],
    ["Most Heismans", coachRows.sort((a,b)=>b.heismans-a.heismans)[0]?.discord, coachRows.sort((a,b)=>b.heismans-a.heismans)[0]?.heismans],
    ["Most Awards", coachRows.sort((a,b)=>b.awards-a.awards)[0]?.discord, coachRows.sort((a,b)=>b.awards-a.awards)[0]?.awards],
    ["Most All-Americans", coachRows.sort((a,b)=>b.allAmericans-a.allAmericans)[0]?.discord, coachRows.sort((a,b)=>b.allAmericans-a.allAmericans)[0]?.allAmericans],
  ];
  return <section style={card}><h2 style={sectionTitle}>CFBElite Dynasty Records</h2><div style={twoCol}>{records.map(([record, holder, value])=><div key={record} style={miniCard}><div style={statTitle}>{record}</div><div style={pulseValue}>{holder || "—"}</div><div style={mutedText}>{value ?? "—"}</div></div>)}</div></section>;
}

function ProgramPrestige({ teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting }) {
  const rows = teams.map((team)=>{
    const rec = recordFromResults(team.id, results);
    const nattys = nationalChampions.filter((row)=>row.team_id===team.id).length + titleCount(team.id, results, "National Championship Week");
    const conf = titleCount(team.id, results, "Conference Championship Week");
    const aa = allAmericans.filter((row)=>row.team_id===team.id).length;
    const aw = awards.filter((row)=>row.team_id===team.id).length;
    const hs = heismans.filter((row)=>row.team_id===team.id).length;
    const bestRecruit = recruiting.filter((row)=>row.team_id===team.id && Number(row.rank)>0).sort((a,b)=>Number(a.rank)-Number(b.rank))[0];
    const recruitScore = bestRecruit ? Math.max(0, 30 - Number(bestRecruit.rank)) : 0;
    const score = rec.wins*2 + nattys*40 + conf*18 + hs*15 + aw*5 + aa*2 + recruitScore;
    return { team, rec, nattys, conf, aa, aw, hs, bestRecruit, score };
  }).filter((row)=>row.rec.games || row.aa || row.aw || row.nattys || row.bestRecruit).sort((a,b)=>b.score-a.score).slice(0,40);
  return <section style={card}><h2 style={sectionTitle}>Program Prestige Rating</h2><p style={mutedText}>School-based hidden prestige score using wins, recruiting, awards, All-Americans, Heismans, and championships.</p><Table headers={["#", "Program", "Score", "Record", "Nattys", "Conf", "Recruiting"]}>{rows.map((row,index)=><tr key={row.team.id} style={trStyle}><td style={rankCell}>#{index+1}</td><td style={teamCell}><TeamLabel team={row.team}/></td><td style={scoreCell}>{row.score.toFixed(1)}</td><td style={td}>{row.rec.wins}-{row.rec.losses}</td><td style={td}>{row.nattys}</td><td style={td}>{row.conf}</td><td style={td}>{row.bestRecruit ? `#${row.bestRecruit.rank}` : "—"}</td></tr>)}</Table></section>;
}

function DynastyPowerIndex({ users, teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting }) {
  const coachRows = getCoachStats(users, teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting);
  const elo = userEloRows(users, assignments, results);
  const eloMap = new Map(elo.map((row)=>[row.user.id,row.adjustedElo || row.elo]));
  const rows = coachRows.map((row)=>{
    const eloValue = eloMap.get(row.userId)||1500;
    const eloScore = Math.max(0, Math.min(100, (eloValue - 1300) / 4));
    const winPctScore = row.games ? row.winPct*100 : 0;
    const bowlGames = row.bowlWins + row.bowlLosses;
    const bowlScore = bowlGames ? (row.bowlWins / bowlGames) * 100 : 0;
    const championshipScore = row.nattys * 20 + row.confTitles * 8;
    const recruitTop25 = recruiting.filter((item)=>Number(item.rank) >= 1 && Number(item.rank) <= 25 && coachForTeamYear(item.team_id, item.season_year, assignments)?.discord_user_id === row.userId).length;
    const recognitionScore = row.allAmericans * 1.4 + row.heismans * 7 + row.awards * 2.2 + recruitTop25 * 3;
    const volumeScore = Math.min(100, row.wins * 2);
    const dpi =
      (eloScore * 0.25) +
      (winPctScore * 0.18) +
      (championshipScore * 0.22) +
      (recognitionScore * 0.16) +
      (bowlScore * 0.09) +
      (volumeScore * 0.10);
    return {...row, elo: eloValue, bowlScore, dpi:Number(dpi.toFixed(1))};
  }).sort((a,b)=>b.dpi-a.dpi).slice(0,40);
  return <section style={card}><h2 style={sectionTitle}>Dynasty Power Index</h2><p style={mutedText}>All-time coach greatness metric: ELO, win percentage, national titles, conference titles, bowl record, All-Americans, awards, Heismans, and total wins.</p><Table headers={["#", "Coach", "DPI", "ELO", "Record", "Nattys", "Conf", "Bowl", "AA", "Awards"]}>{rows.map((row,index)=><tr key={row.userId} style={trStyle}><td style={rankCell}>#{index+1}</td><td style={teamCell}>{row.discord}</td><td style={scoreCell}>{row.dpi}</td><td style={td}>{row.elo}</td><td style={td}>{row.wins}-{row.losses}</td><td style={td}>{row.nattys}</td><td style={td}>{row.confTitles}</td><td style={td}>{row.bowlWins}-{row.bowlLosses}</td><td style={td}>{row.allAmericans}</td><td style={td}>{row.awards}</td></tr>)}</Table></section>;
}


function BestWorstPanel({ user, results, assignments }) {
  const streak = streakFromGames(userResultsFor(user.id, results, assignments), user.id, assignments);
  const { best, worst } = bestAndWorstGames(user.id, results, assignments);
  return <div style={twoCol}><div style={miniCard}><h3 style={miniTitle}>Streaks</h3><div style={leaderRow}><span>Current</span><b>{streak.current}</b></div><div style={leaderRow}><span>Longest Win Streak</span><b>{streak.longestWin}</b></div><div style={leaderRow}><span>Longest Losing Streak</span><b>{streak.longestLoss}</b></div></div><div style={miniCard}><h3 style={miniTitle}>Best Win / Worst Loss</h3><div style={miniRow}>Best Win: {best ? `${best.opponentName} ${best.forPts}-${best.againstPts}` : "—"}</div><div style={miniRow}>Worst Loss: {worst ? `${worst.opponentName} ${worst.forPts}-${worst.againstPts}` : "—"}</div></div></div>;
}


function DashboardHomeHero({ teams, users, assignments, results, allResults, weeklyMatchups, currentYear, currentWeek }) {
  const rankings = computerRankingRows(teams, results, assignments, users);
  const topTeam = rankings[0];
  const eloTop = userEloRows(users, assignments, allResults)[0];
  const gotw = weeklyMatchupRows(weeklyMatchups, teams, users, assignments, results, currentYear, currentWeek)[0];

  return (
    <section style={homeHeroCard}>
      <div>
        <div style={eyebrow}>CFBElite Dynasty Central</div>
        <h1 style={homeHeroTitle}>{currentYear} • {currentWeek}</h1>
        <p style={mutedText}>League hub for rankings, ELO, weekly media, milestones, rivalries, and coach profiles.</p>
      </div>
      <div style={homeHeroGrid}>
        <div style={homeHeroTile}><span>#1 Team</span><b>{topTeam?.teamName || "—"}</b></div>
        <div style={homeHeroTile}><span>#1 User ELO</span><b>{eloTop?.discord || "—"}</b></div>
        <div style={homeHeroTile}><span>Game of the Week</span><b>{gotw ? `${gotw.team_1?.name || "Team 1"} vs ${gotw.team_2?.name || "Team 2"}` : "Enter matchups"}</b></div>
      </div>
    </section>
  );
}

function HeadlineTicker({ teams, users, assignments, results, allResults, allAmericans, awards, heismans, nationalChampions, recruiting, currentYear, currentWeek }) {
  const lines = [];
  const rankings = computerRankingRows(teams, results, assignments, users);
  const top = rankings[0];
  const eloRows = userEloRows(users, assignments, allResults);
  const elo = eloRows[0];
  const weekResults = results.filter((row)=>String(row.season_year) === String(currentYear) && row.week === currentWeek);

  if (top) lines.push(`${top.teamName} sits #1 in the computer rankings`);
  if (elo) lines.push(`${elo.discord} leads User ELO at ${elo.adjustedElo || elo.elo}`);
  rankings.slice(1,5).forEach((row)=>lines.push(`#${row.rank} ${row.teamName} is chasing the top spot at ${row.score}`));
  weekResults.slice(0,8).forEach((row)=>lines.push(`${row.team_1?.name || "Team 1"} ${row.team_1_score} - ${row.team_2_score} ${row.team_2?.name || "Team 2"}`));
  const champ = nationalChampions.find((row)=>String(row.season_year) === String(currentYear));
  if (champ) lines.push(`${champ.teams?.name || teamNameById(champ.team_id, teams)} is the reigning ${currentYear} national champion`);
  heismans.filter((row)=>String(row.season_year) === String(currentYear)).slice(0,3).forEach((row)=>lines.push(`${row.player_name} is on the Heisman board for ${row.teams?.name || teamNameById(row.team_id, teams)}`));
  awards.filter((row)=>String(row.season_year) === String(currentYear)).slice(0,5).forEach((row)=>lines.push(`${row.player_name} won ${row.award_name}`));
  allAmericans.filter((row)=>String(row.season_year) === String(currentYear)).slice(0,5).forEach((row)=>lines.push(`${row.player_name} earned ${row.type || "All-American"} honors`));
  recruiting.filter((row)=>String(row.season_year) === String(currentYear) && Number(row.rank)>0).sort((a,b)=>Number(a.rank)-Number(b.rank)).slice(0,5).forEach((row)=>lines.push(`${row.teams?.name || teamNameById(row.team_id, teams)} logged the #${row.rank} recruiting class`));
  if (!lines.length) lines.push("Enter results to generate dynasty headlines");

  const tickerLines = lines.concat(lines).concat(lines);

  return <div style={tickerWrap}>
    <style>{`@keyframes cfbeliteTicker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`}</style>
    <div style={tickerContent}>{tickerLines.map((line,index)=><span key={index}>📰 {line}</span>)}</div>
  </div>;
}

function QuickJump({ teams, users, setActiveTab }) {
  const [query, setQuery] = useState("");
  const teamMatches = teams.filter((team)=>team.name.toLowerCase().includes(query.toLowerCase())).slice(0,5);
  const userMatches = users.filter((user)=>user.discord_username.toLowerCase().includes(query.toLowerCase())).slice(0,5);
  return (
    <section style={quickJumpCard}>
      <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Jump to team or coach..." style={input}/>
      {query && <div style={quickJumpResults}>
        {teamMatches.map((team)=><button key={team.id} style={quickJumpButton} onClick={()=>setActiveTab(`team-${team.id}`)}><TeamLabel team={team}/></button>)}
        {userMatches.map((user)=><button key={user.id} style={quickJumpButton} onClick={()=>setActiveTab(`coach-${user.id}`)}>{user.discord_username}</button>)}
      </div>}
    </section>
  );
}

function RivalryBadges({ user, users, allUsers = [], results, assignments }) {
  const games = userResultsFor(user.id, results, assignments);
  const map = new Map();
  const nameForUser = (id) =>
    allUsers.find((u)=>u.id===id)?.discord_username ||
    users.find((u)=>u.id===id)?.discord_username ||
    assignments.find((a)=>a.discord_user_id===id)?.discord_users?.discord_username ||
    "Unknown User";

  games.forEach((result)=>{
    const u1 = result.team_1_user_id || coachForTeamYear(result.team_1_id, result.season_year, assignments)?.discord_user_id;
    const u2 = result.team_2_user_id || coachForTeamYear(result.team_2_id, result.season_year, assignments)?.discord_user_id;
    const opponentId = u1 === user.id ? u2 : u1;
    if (!opponentId) return;
    if (!map.has(opponentId)) map.set(opponentId, { opponentId, opponentName: nameForUser(opponentId), w:0, l:0, pf:0, pa:0, games:0, last:null });
    const row = map.get(opponentId);
    const isTeam1 = u1 === user.id;
    const forPts = Number(isTeam1 ? result.team_1_score : result.team_2_score) || 0;
    const againstPts = Number(isTeam1 ? result.team_2_score : result.team_1_score) || 0;
    const won = forPts > againstPts;
    row.games += 1; row.pf += forPts; row.pa += againstPts;
    if (won) row.w += 1; else if (forPts < againstPts) row.l += 1;
    const sort = Number(result.season_year || 0) * 1000 + weekIndex(result.week);
    if (!row.last || sort > row.last.sort) row.last = { sort, forPts, againstPts, type: won ? "W" : "L" };
  });
  const rows = [...map.values()].filter((r)=>r.games>=2).sort((a,b)=>b.games-a.games || b.w-a.w).slice(0,4);
  if (!rows.length) return null;
  return <div style={glassMiniCard}><h3 style={miniTitle}>Rivalry Badges</h3><div style={rivalryBadgeGrid}>{rows.map((r)=><div key={r.opponentId} style={rivalryBadge}><div style={leaderRow}><b>{r.opponentName}</b><span>{r.w}-{r.l}</span></div><div style={mutedText}>{r.games} meetings • Points: {r.pf}-{r.pa}</div><div style={mutedText}>Last: {r.last?.type || "—"} {r.last ? `${r.last.forPts}-${r.last.againstPts}` : ""}</div></div>)}</div></div>;
}

function CoachTimelineEvents({ user, teams, results, allAmericans, awards, heismans, nationalChampions, assignments }) {
  const events = [
    ...nationalChampions.filter((row)=>coachForTeamYear(row.team_id, row.season_year, assignments)?.discord_user_id === user.id).map((row)=>({year:row.season_year,text:`National Championship with ${teamNameById(row.team_id, teams)}`})),
    ...heismans.filter((row)=>coachForTeamYear(row.team_id, row.season_year, assignments)?.discord_user_id === user.id).map((row)=>({year:row.season_year,text:`${row.player_name} won the Heisman`})),
    ...awards.filter((row)=>coachForTeamYear(row.team_id, row.season_year, assignments)?.discord_user_id === user.id).slice(0,12).map((row)=>({year:row.season_year,text:`${row.player_name} won ${row.award_name}`})),
    ...results.filter((row)=>row.week==="Conference Championship Week" && (coachForTeamYear(row.team_1_id, row.season_year, assignments)?.discord_user_id === user.id || coachForTeamYear(row.team_2_id, row.season_year, assignments)?.discord_user_id === user.id)).map((row)=>({year:row.season_year,text:`Conference Championship appearance`}))
  ].sort((a,b)=>Number(b.year)-Number(a.year)).slice(0,10);
  if (!events.length) return null;
  return <div style={miniCard}><h3 style={miniTitle}>Coach Timeline</h3>{events.map((event,index)=><div key={index} style={miniRow}><b>{event.year}</b> — {event.text}</div>)}</div>;
}

function CommissionerCenter({ currentYear, currentWeek, setActiveTab, saveLeagueSettings, loadData, teams = [], users = [], assignments = [], results = [], awards = [], allAmericans = [], heismans = [], nationalChampions = [], recruiting = [] }) {
  const actions = [
    ["weeklyMatchups", "Import Weekly Matchups"],
    [ "Generate Weekly Media"],
    ["dashboard", "Review Dashboard"],
    ["eloRankings", "Review ELO"],
    ["dynastyRecords", "League Records"],
    ["assignments", "Manage Assignments"],
  ];
  return <section style={card}><h2 style={sectionTitle}>Commissioner Control Center</h2><p style={mutedText}>{currentYear} • {currentWeek}</p><div style={toolGrid}>{actions.map(([key,label])=><button key={key} style={toolCard} onClick={()=>setActiveTab(key)}><div style={toolTitle}>{label}</div></button>)}</div><div style={actionRow}><button style={button} onClick={loadData}>Refresh Data</button><button style={button} onClick={saveLeagueSettings}>Save League Settings</button></div><BackupExportPanel teams={teams} users={users} assignments={assignments} results={results} awards={awards} allAmericans={allAmericans} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting}/></section>;
}


function ConferencePowerRankings({ teams, users, assignments, results, allResults = [], allAmericans = [], awards = [], heismans = [], nationalChampions = [], recruiting = [] }) {
  const activeAssignments = assignments.filter((assignment)=>assignment.status === "Active" && assignment.team_id && assignment.discord_user_id);
  const activeTeamIds = new Set(activeAssignments.map((assignment)=>assignment.team_id));
  const activeTeams = teams.filter((team)=>activeTeamIds.has(team.id));
  const rankingRows = computerRankingRows(activeTeams, results, assignments, users);
  const eloRows = userEloRows(users, assignments, allResults.length ? allResults : results);
  const eloMap = new Map(eloRows.map((row) => [row.user.id, row.adjustedElo || row.elo]));

  const conferenceMap = new Map();

  activeTeams.forEach((team) => {
    const conference = normalizeDraftConference(team.conference) || "Unassigned";
    if (!conferenceMap.has(conference)) {
      conferenceMap.set(conference, {
        conference,
        teams: 0,
        recordWins: 0,
        recordLosses: 0,
        teamScore: 0,
        eloScore: 0,
        nattys: 0,
        confTitles: 0,
        recruitingScore: 0,
        recruitingCount: 0,
        allAmericans: 0,
        awards: 0,
        heismans: 0,
        top25: 0,
      });
    }
  });

  const rankingMap = new Map(rankingRows.map((row) => [row.team.id, row]));

  activeTeams.forEach((team) => {
    const conference = normalizeDraftConference(team.conference) || "Unassigned";
    const row = conferenceMap.get(conference);
    const ranking = rankingMap.get(team.id);
    const rec = recordFromResults(team.id, results);
    const activeAssignment = activeAssignments.find((assignment) => assignment.team_id === team.id);
    const userElo = eloMap.get(activeAssignment?.discord_user_id) || 1500;
    const fullResults = allResults.length ? allResults : results;

    const teamNattys = nationalChampions.filter((item)=>item.team_id === team.id).length + titleCount(team.id, fullResults, "National Championship Week");
    const teamConfTitles = titleCount(team.id, fullResults, "Conference Championship Week");
    const teamAA = allAmericans.filter((item)=>item.team_id === team.id).length;
    const teamAwards = awards.filter((item)=>item.team_id === team.id).length;
    const teamHeismans = heismans.filter((item)=>item.team_id === team.id).length;
    const bestRecruit = recruiting.filter((item)=>item.team_id === team.id && Number(item.rank) > 0).sort((a,b)=>Number(a.rank)-Number(b.rank))[0];

    row.teams += 1;
    row.recordWins += rec.wins;
    row.recordLosses += rec.losses;
    row.teamScore += ranking?.score || 0;
    row.eloScore += Math.max(0, Math.min(100, (userElo - 1300) / 4));
    row.nattys += teamNattys;
    row.confTitles += teamConfTitles;
    row.allAmericans += teamAA;
    row.awards += teamAwards;
    row.heismans += teamHeismans;
    if (ranking?.rank <= 25) row.top25 += 1;

    if (bestRecruit) {
      row.recruitingScore += Math.max(0, 101 - Number(bestRecruit.rank));
      row.recruitingCount += 1;
    }
  });

  const ranked = [...conferenceMap.values()]
    .map((row) => {
      const games = row.recordWins + row.recordLosses;
      const performance = row.teams ? row.teamScore / row.teams : 0;
      const userStrength = row.teams ? row.eloScore / row.teams : 0;
      const winPct = games ? row.recordWins / games : 0;
      const championshipScore = Math.min(100, (row.nattys * 28) + (row.confTitles * 10));
      const recruitingAvg = row.recruitingCount ? row.recruitingScore / row.recruitingCount : 45;
      const recognitionScore = Math.min(100, (row.allAmericans * 2.2) + (row.awards * 4.0) + (row.heismans * 10));
      const currentPerformanceScore = (performance * 0.75) + (winPct * 25) + (row.top25 * 1.2);
      const power = (currentPerformanceScore * 0.40) + (userStrength * 0.25) + (championshipScore * 0.15) + (recruitingAvg * 0.10) + (recognitionScore * 0.10);

      return { ...row, games, winPct, performance, userStrength, championshipScore, recruitingAvg, recognitionScore, currentPerformanceScore, power: Number(power.toFixed(1)) };
    })
    .sort((a,b)=>b.power-a.power);

  return (
    <section style={card}>
      <h2 style={sectionTitle}>Conference Power Rankings</h2>
      <p style={mutedText}>Only conferences with active user-controlled teams are included.</p>
      <Table headers={["#", "Conference", "Power", "Performance", "User ELO", "Titles", "Recruiting", "Recognition", "Record", "Users"]}>
        {ranked.map((row,index)=>(
          <tr key={row.conference} style={trStyle}>
            <td style={rankCell}>#{index+1}</td>
            <td style={teamCell}>{row.conference}</td>
            <td style={scoreCell}>{row.power}</td>
            <td style={td}>{row.currentPerformanceScore.toFixed(1)}</td>
            <td style={td}>{row.userStrength.toFixed(1)}</td>
            <td style={td}>{row.championshipScore.toFixed(1)}</td>
            <td style={td}>{row.recruitingAvg.toFixed(1)}</td>
            <td style={td}>{row.recognitionScore.toFixed(1)}</td>
            <td style={td}>{row.recordWins}-{row.recordLosses}</td>
            <td style={td}>{row.teams}</td>
          </tr>
        ))}
      </Table>
    </section>
  );
}

function toCsvValue(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(filename, rows) {
  if (!rows?.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map((row)=>headers.map((h)=>toCsvValue(row[h])).join(","))].join("\\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function BackupExportPanel({ teams, users, assignments, results, awards, allAmericans, heismans, nationalChampions, recruiting }) {
  const exports = [
    ["teams.csv", teams],
    ["users.csv", users],
    ["assignments.csv", assignments],
    ["game_results.csv", results],
    ["awards.csv", awards],
    ["all_americans.csv", allAmericans],
    ["heismans.csv", heismans],
    ["national_champions.csv", nationalChampions],
    ["recruiting.csv", recruiting],
  ];

  return <div style={miniCard}><h3 style={miniTitle}>Backup / Export CSV</h3><p style={mutedText}>Commissioner-only quick exports for backup or audit purposes.</p><div style={actionRow}>{exports.map(([filename, rows])=><button key={filename} type="button" style={ghostButton} onClick={()=>downloadCsv(filename, rows)}>{filename}</button>)}</div></div>;
}

function DataHealthAlerts({ teams, users, assignments, results }) {
  const alerts = [];
  const active = assignments.filter((row)=>row.status === "Active");
  const duplicateTeams = active.reduce((map,row)=>map.set(row.team_id,(map.get(row.team_id)||0)+1), new Map());
  const duplicateUsers = active.reduce((map,row)=>map.set(row.discord_user_id,(map.get(row.discord_user_id)||0)+1), new Map());
  const teamsMissingColors = teams.filter((team)=>!team.primary_color || !team.secondary_color || !team.accent_color || !team.conference);

  if (teamsMissingColors.length) {
    alerts.push(`${teamsMissingColors.length} team${teamsMissingColors.length===1?"":"s"} missing colors/conference: ${teamsMissingColors.slice(0,6).map((team)=>team.name).join(", ")}${teamsMissingColors.length > 6 ? "..." : ""}`);
  }
  if ([...duplicateTeams.values()].some((count)=>count>1)) alerts.push("Duplicate active team assignments detected");
  if ([...duplicateUsers.values()].some((count)=>count>1)) alerts.push("Duplicate active user assignments detected");
  if (results.some((row)=>!row.team_1_id || !row.team_2_id)) alerts.push("Some results are missing team IDs");
  if (results.some((row)=>row.team_1_score === null || row.team_2_score === null)) alerts.push("Some results are missing scores");

  if (!alerts.length) return <section style={healthGood}>✓ Data health looks good</section>;
  return <section style={healthWarn}><b>Data Health Alerts</b>{alerts.map((alert,index)=><div key={index}>⚠ {alert}</div>)}</section>;
}



function normalizeDraftConference(conference) {
  const value = String(conference || "").trim();
  const upper = value.toUpperCase();
  if (upper === "PAC-12" || upper === "PAC 12") return "PAC 12";
  if (upper === "CONFERENCE USA" || upper === "C-USA" || upper === "CUSA") return "CUSA";
  if (upper === "MOUNTAIN WEST") return "Mountain West";
  if (upper === "SUN BELT") return "Sun Belt";
  if (upper === "AMERICAN" || upper === "AAC") return "American";
  if (upper === "MAC") return "MAC";
  return value;
}


const CFB27_APPROVED_DRAFT_TEAMS = new Set([
  "Army Black Knights","Charlotte 49ers","East Carolina Pirates","Florida Atlantic Owls","Memphis Tigers","Navy Midshipmen","North Texas Mean Green","Rice Owls","South Florida Bulls","USF Bulls","Temple Owls","Tulane Green Wave","Tulsa Golden Hurricane","UAB Blazers","UTSA Roadrunners",
  "Delaware Fightin’ Blue Hens","FIU Panthers","Jacksonville State Gamecocks","Kennesaw State Owls","Liberty Flames","Middle Tennessee Blue Raiders","Missouri State Bears","New Mexico State Aggies","Sam Houston Bearkats","Western Kentucky Hilltoppers",
  "Akron Zips","Ball State Cardinals","Bowling Green Falcons","Buffalo Bulls","Central Michigan Chippewas","Eastern Michigan Eagles","Kent State Golden Flashes","Miami (OH) RedHawks","Ohio Bobcats","Sacramento State Hornets","Sacremento State","Toledo Rockets","UMass Minutemen","Western Michigan Broncos",
  "Air Force Falcons","Hawaii Rainbow Warriors","Nevada Wolf Pack","New Mexico Lobos","North Dakota State","North Dakota State Bison","Northern Illinois Huskies","San Jose State Spartans","UNLV Rebels","UTEP Miners","Wyoming Cowboys",
  "Boise State Broncos","Colorado State Rams","Fresno State Bulldogs","Oregon State Beavers","San Diego State Aztecs","Texas State Bobcats","Utah State Aggies","Washington State Cougars",
  "Appalachian State Mountaineers","Arkansas State Red Wolves","Coastal Carolina Chanticleers","Georgia Southern Eagles","Georgia State Panthers","James Madison Dukes","Louisiana Ragin’ Cajuns","Louisiana Tech Bulldogs","Louisiana-Monroe Warhawks","Marshall Thundering Herd","Old Dominion Monarchs","South Alabama Jaguars","Southern Miss Golden Eagles","Troy Trojans"
]);

function isDraftEligibleTeam(team) {
  return CFB27_APPROVED_DRAFT_TEAMS.has(team?.name);
}

const CFB27_DRAFT_CONFERENCES = new Set(["American", "CUSA", "MAC", "Mountain West", "PAC 12", "Pac-12", "Sun Belt"]);

function draftPickCaption(pick, team) {
  if (!pick || !team) return "";
  return `🚨 THE PICK IS IN 🚨\n\nWith Pick #${String(pick.pick_number).padStart(2, "0")} in the CFBElite 27 Team Draft...\n\n${pick.discord_username || pick.discord_users?.discord_username} selects the ${team.name}!\n\nWelcome to ${normalizeDraftConference(team.conference) || "CFBElite"}.`;
}

function downloadDraftPickGraphic(pick, team) {
  if (!pick || !team) return;
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 675;
  const ctx = canvas.getContext("2d");
  const primary = team.primary_color || "#20114f";
  const secondary = team.secondary_color || "#facc15";
  const accent = team.accent_color || "#ffffff";

  const grad = ctx.createLinearGradient(0,0,1200,675);
  grad.addColorStop(0, primary);
  grad.addColorStop(.52, "#050510");
  grad.addColorStop(1, secondary);
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,1200,675);

  ctx.globalAlpha = .22;
  ctx.fillStyle = "#ffffff";
  for (let i=0;i<80;i++) ctx.fillRect(Math.random()*1200, Math.random()*675, 3, 3);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = secondary;
  ctx.lineWidth = 4;
  ctx.strokeRect(34,34,1132,607);

  ctx.fillStyle = "rgba(0,0,0,.40)";
  ctx.fillRect(70,120,290,390);
  ctx.strokeStyle = "rgba(255,255,255,.22)";
  ctx.strokeRect(70,120,290,390);

  ctx.fillStyle = "#fff";
  ctx.font = "900 42px Inter, Arial";
  ctx.fillText("CFBELITE 27 TEAM DRAFT", 72, 82);

  ctx.fillStyle = accent;
  ctx.font = "900 46px Inter, Arial";
  ctx.fillText("THE PICK IS IN", 430, 150);

  ctx.fillStyle = "#fff";
  ctx.font = "900 52px Inter, Arial";
  ctx.fillText((pick.discord_username || pick.discord_users?.discord_username || "USER").toUpperCase(), 430, 235);

  ctx.fillStyle = accent;
  ctx.font = "900 34px Inter, Arial";
  ctx.fillText("SELECTS", 430, 292);

  ctx.fillStyle = "#fff";
  ctx.font = "900 86px Inter, Arial";
  ctx.fillText(team.name.toUpperCase().replace(" ", " "), 430, 390);

  ctx.fillStyle = "#fff";
  ctx.font = "900 64px Inter, Arial";
  ctx.fillText("PICK", 110, 185);
  ctx.font = "1000 170px Inter, Arial";
  ctx.fillText(String(pick.pick_number).padStart(2, "0"), 105, 390);

  ctx.fillStyle = secondary;
  ctx.font = "900 40px Inter, Arial";
  ctx.fillText(normalizeDraftConference(team.conference) || "CFBElite", 430, 475);

  ctx.fillStyle = "#fff";
  ctx.font = "900 32px Inter, Arial";
  ctx.fillText("#CFBELITE27", 72, 610);

  const link = document.createElement("a");
  link.download = `cfbelite27-pick-${String(pick.pick_number).padStart(2, "0")}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function DraftCountdown({ pick, settings }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (settings?.paused) return <span>PAUSED</span>;
  if (!pick?.timer_started_at) return <span>Clock not started</span>;
  const minutes = Number(pick.timer_minutes || settings?.timer_minutes || 10);
  const end = new Date(pick.timer_started_at).getTime() + minutes * 60 * 1000;
  const remaining = Math.max(0, end - now);
  const m = Math.floor(remaining / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  return <span>{String(m).padStart(2,"0")}:{String(s).padStart(2,"0")}</span>;
}


function draftConferenceCounts(picks, teams) {
  const counts = {};
  picks.forEach((pick) => {
    if (!pick.team_id || pick.status !== "picked") return;
    const team = teams.find((item)=>String(item.id) === String(pick.team_id)) || pick.teams;
    const conference = normalizeDraftConference(team?.conference);
    if (!conference) return;
    counts[conference] = (counts[conference] || 0) + 1;
  });
  return counts;
}

function lockedDraftConferences(picks, teams) {
  const counts = draftConferenceCounts(picks, teams);
  const conferencesAtSix = Object.entries(counts)
    .filter(([, count]) => count >= 6)
    .map(([conference]) => conference);

  const locked = new Set();

  // First two conferences to reach six users are capped at six.
  conferencesAtSix.slice(0, 2).forEach((conference) => locked.add(conference));

  // After two conferences have reached six, all other conferences cap at five.
  if (conferencesAtSix.length >= 2) {
    Object.entries(counts)
      .filter(([conference, count]) => !locked.has(conference) && count >= 5)
      .forEach(([conference]) => locked.add(conference));
  }

  return locked;
}

function draftConferenceLimitFor(conference, lockedConferences, counts) {
  if (lockedConferences.has(conference)) return counts[conference] >= 6 ? 6 : 5;
  return null;
}

function DraftRoom({ teams, users, picks = [], settings = {}, startClock, pauseClock, resumeClock, announcePick, revealPick, undoPick }) {
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [teamSearch, setTeamSearch] = useState("");
  const [timerMinutes, setTimerMinutes] = useState(settings?.timer_minutes || 10);
  const [localClock, setLocalClock] = useState(null);
  const [draftAdminUnlocked, setDraftAdminUnlocked] = useState(false);
  const [draftAdminCode, setDraftAdminCode] = useState("");

  const sortedPicks = [...(picks || [])].sort((a,b)=>Number(a.pick_number || 0)-Number(b.pick_number || 0));
  const currentPickBase =
    sortedPicks.find((pick)=>Number(pick.pick_number) === Number(settings?.current_pick || 1)) ||
    sortedPicks.find((pick)=>!pick.team_id || pick.status === "pick_is_in") ||
    sortedPicks[0] ||
    { pick_number: 1, discord_username: "User TBD", status: "pending" };

  const currentPick = localClock && Number(localClock.pick_number) === Number(currentPickBase?.pick_number)
    ? { ...currentPickBase, timer_started_at: localClock.timer_started_at, timer_minutes: localClock.timer_minutes, status: currentPickBase?.status === "picked" ? "picked" : "on_clock" }
    : currentPickBase;

  const pickedTeamIds = new Set(sortedPicks.filter((pick)=>pick.team_id && pick.status === "picked").map((pick)=>pick.team_id));
  const reservedTeamIds = new Set(sortedPicks.filter((pick)=>pick.team_id).map((pick)=>pick.team_id));
  const conferenceCounts = draftConferenceCounts(sortedPicks, teams);
  const lockedConferences = lockedDraftConferences(sortedPicks, teams);

  const availableTeams = (teams || [])
    .filter((team)=>isDraftEligibleTeam(team))
    .filter((team)=>CFB27_DRAFT_CONFERENCES.has(normalizeDraftConference(team.conference)))
    .filter((team)=>!lockedConferences.has(normalizeDraftConference(team.conference)))
    .filter((team)=>!reservedTeamIds.has(team.id))
    .filter((team)=>!teamSearch || team.name.toLowerCase().includes(teamSearch.toLowerCase()) || String(normalizeDraftConference(team.conference) || "").toLowerCase().includes(teamSearch.toLowerCase()))
    .sort((a,b)=>a.name.localeCompare(b.name));

  const selectedTeam = (teams || []).find((team)=>String(team.id) === String(selectedTeamId));
  const latestPick = [...sortedPicks].reverse().find((pick)=>pick.team_id && pick.status === "picked");
  const latestTeam = latestPick ? (teams || []).find((team)=>String(team.id) === String(latestPick.team_id)) || latestPick.teams : null;
  const stagedPick = sortedPicks.find((pick)=>pick.status === "pick_is_in");
  const stagedTeam = stagedPick ? (teams || []).find((team)=>String(team.id) === String(stagedPick.team_id)) || stagedPick.teams : null;

  function handleStartClock() {
    const started = new Date().toISOString();
    setLocalClock({ pick_number: currentPick?.pick_number, timer_started_at: started, timer_minutes: Number(timerMinutes) || 10 });
    startClock?.(currentPick?.pick_number, timerMinutes);
  }

  function handlePickIsIn() {
    if (!selectedTeamId) {
      alert("Select a team first.");
      return;
    }
    announcePick?.(currentPick?.pick_number, selectedTeamId);
  }

  return (
    <section style={draftRoomWrap}>
      <div style={draftHero}>
        <div>
          <div style={eyebrow}>CFBElite 27 Draft Room</div>
          <h2 style={draftHeroTitle}>The Board Is Live</h2>
          <p style={mutedText}>Available teams are limited to American, CUSA, MAC, Mountain West, PAC 12, and Sun Belt.</p>
        </div>
        <div style={onClockCard}>
          <div style={eyebrow}>{currentPick?.status === "pick_is_in" ? "The Pick Is In" : "On The Clock"}</div>
          <div style={draftClockPick}>Pick #{String(currentPick?.pick_number || 1).padStart(2,"0")}</div>
          <div style={draftClockUser}>{currentPick?.discord_username || currentPick?.discord_users?.discord_username || "User TBD"}</div>
          <div style={draftTimer}><DraftCountdown pick={currentPick} settings={settings}/></div>
        </div>
      </div>

      <div style={draftBroadcastBanner}>
        <div>
          <div style={eyebrow}>{currentPick?.status === "pick_is_in" ? "The Pick Is In" : "On The Clock"}</div>
          <div style={draftBroadcastTitle}>Pick #{String(currentPick?.pick_number || 1).padStart(2,"0")} · {currentPick?.discord_username || currentPick?.discord_users?.discord_username || "User TBD"}</div>
        </div>
        <div style={draftBroadcastTimer}><DraftCountdown pick={currentPick} settings={settings}/></div>
      </div>

      <div style={card}>
        <h3 style={miniTitle}>Commissioner Controls</h3>

        {!draftAdminUnlocked ? (
          <div style={filterGrid}>
            <input
              style={input}
              type="password"
              value={draftAdminCode}
              onChange={(e) => setDraftAdminCode(e.target.value)}
              placeholder="Commissioner code"
            />
            <button
              style={button}
              type="button"
              onClick={() => setDraftAdminUnlocked(true)}
            >
              Unlock Draft Controls
            </button>
          </div>
        ) : (
          <div style={filterGrid}>
            <input
              style={input}
              type="number"
              min="1"
              max="60"
              value={timerMinutes}
              onChange={(e) => setTimerMinutes(e.target.value)}
              placeholder="Clock minutes"
            />

            <select
              style={input}
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
            >
              <option value="">Select Team For Pick #{currentPick?.pick_number || ""}</option>
              {availableTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name} - {normalizeDraftConference(team.conference)}
                </option>
              ))}
            </select>

            <button
              style={button}
              type="button"
              onClick={() => {
                const started = new Date().toISOString();
                setLocalClock({
                  pick_number: currentPick?.pick_number,
                  timer_started_at: started,
                  timer_minutes: Number(timerMinutes) || 10
                });
                if (startClock) startClock(currentPick?.pick_number, timerMinutes);
              }}
            >
              Start / Reset Clock
            </button>

            <button
              style={button}
              type="button"
              onClick={() => {
                if (pauseClock) pauseClock();
              }}
            >
              Pause Clock
            </button>

            <button
              style={button}
              type="button"
              onClick={() => {
                if (resumeClock) resumeClock();
              }}
            >
              Resume Clock
            </button>

            <button
              style={button}
              type="button"
              disabled={!selectedTeamId}
              onClick={() => {
                if (!selectedTeamId) {
                  alert("Select a team first.");
                  return;
                }
                if (announcePick) announcePick(currentPick?.pick_number, selectedTeamId);
              }}
            >
              Pick Is In
            </button>

            {stagedPick && (
              <button
                style={button}
                type="button"
                onClick={() => {
                  if (revealPick) revealPick(stagedPick.pick_number);
                }}
              >
                Reveal / Post to Board
              </button>
            )}
          </div>
        )}
      </div>

      <div style={glassMiniCard}>
        <h3 style={miniTitle}>Conference Draft Caps</h3>
        <div style={draftConferenceGrid}>
          {[...CFB27_DRAFT_CONFERENCES].map((conference)=>{
            const count = conferenceCounts[conference] || 0;
            const locked = lockedConferences.has(conference);
            const cap = locked ? (count >= 6 ? 6 : 5) : "Open";
            return <div key={conference} style={locked ? draftConferenceTileLocked : draftConferenceTile}><b>{conference}</b><span>{count} selected</span><small>{locked ? `LOCKED at ${cap}` : "Available"}</small></div>;
          })}
        </div>
      </div>

      {latestPick && latestTeam && <div style={pickAnnouncementCard}><div style={eyebrow}>Latest Pick</div><h3 style={pickAnnouncementTitle}>Pick #{String(latestPick.pick_number).padStart(2,"0")} · {latestPick.discord_username || latestPick.discord_users?.discord_username}</h3><p style={pickTeamLine}>{latestTeam.name}</p></div>}

      <div style={twoCol}>
        <div style={glassMiniCard}>
          <h3 style={miniTitle}>Draft Board</h3>
          <div style={draftBoardGrid}>
            {sortedPicks.map((pick)=>{
              const team = (teams || []).find((t)=>String(t.id)===String(pick.team_id)) || pick.teams;
              const publicTeamVisible = pick.status === "picked";
              return <div key={pick.pick_number} style={draftPickTile}>
                <div style={draftPickHeader}><b>#{String(pick.pick_number).padStart(2,"0")}</b><span>{pick.status === "pick_is_in" ? "PICK IS IN" : (pick.status || "pending")}</span></div>
                <div style={draftTileUser}>{pick.discord_username || pick.discord_users?.discord_username}</div>
                <div style={publicTeamVisible && team ? draftTileTeam : mutedText}>{publicTeamVisible && team ? team.name : (pick.status === "pick_is_in" ? "Team hidden until reveal" : "On deck")}</div>
                {draftAdminUnlocked && pick.team_id && <button style={ghostButton} onClick={()=>undoPick?.(pick.pick_number)}>Undo</button>}
              </div>;
            })}
          </div>
        </div>

        <div style={glassMiniCard}>
          <h3 style={miniTitle}>Available Teams · {availableTeams.length}</h3>
          <input style={input} value={teamSearch} onChange={(e)=>setTeamSearch(e.target.value)} placeholder="Search available teams or conference..." />
          <div style={availableTeamGrid}>
            {availableTeams.map((team)=><div key={team.id} style={availableTeamTile}><b>{team.name}</b><span>{normalizeDraftConference(team.conference)}</span></div>)}
          </div>
        </div>
      </div>
    </section>
  );
}

function AdminLocked({ adminCodeInput, setAdminCodeInput, unlockAdmin }) {
  return (
    <section style={card}>
      <h2 style={sectionTitle}>Commissioner Access Required</h2>
      <p style={mutedText}>This page is locked so league members can view the dashboard without seeing admin tools.</p>
      <div style={adminLockPanel}>
        <input value={adminCodeInput} onChange={(e)=>setAdminCodeInput(e.target.value)} placeholder="Commissioner code" style={input}/>
        <button style={button} onClick={unlockAdmin}>Unlock</button>
      </div>
    </section>
  );
}

function Watchlist({ teams, users, assignments, results, currentWeek }) {
  const rankings = computerRankingRows(teams, results, assignments, users);
  const undefeated = rankings.filter((row)=>row.wins > 0 && row.losses === 0).slice(0,5);
  const winless = rankings.filter((row)=>row.games > 0 && row.wins === 0).slice(0,5);
  const highRisk = rankings.filter((row)=>row.games && row.sor >= 7).slice(0,5);
  return (
    <section style={card}>
      <h2 style={sectionTitle}>League Watchlist</h2>
      <div style={threeCol}>
        <LeaderboardCard title="Undefeated Watch" rows={undefeated.map((r)=>({team:r.teamName,total:`${r.wins}-${r.losses}`}))}/>
        <LeaderboardCard title="Struggle Watch" rows={winless.map((r)=>({team:r.teamName,total:`${r.wins}-${r.losses}`}))}/>
        <LeaderboardCard title="Tough Road Watch" rows={highRisk.map((r)=>({team:r.teamName,total:r.sor.toFixed(1)}))}/>
      </div>
    </section>
  );
}

function weeklyRankingsPost(teams, results, assignments, users) {
  const rows = computerRankingRows(teams, results, assignments, users).slice(0,25);
  return ["📊 CFBElite Computer Rankings", "", ...rows.map((row)=>`${row.rank}. ${row.teamName} (${row.wins}-${row.losses}) — ${row.score.toFixed(1)}`)].join("\\n");
}

function weeklyGotwPost(teams, users, assignments, results, weeklyMatchups, currentYear, currentWeek) {
  const game = weeklyMatchupRows(weeklyMatchups, teams, users, assignments, results, currentYear, currentWeek)[0];
  if (!game) return `🔥 CFBElite Game of the Week\\n\\nNo matchup entered for ${currentYear} ${currentWeek}.`;
  return [`🔥 CFBElite Game of the Week`, "", `${game.team_1?.name || "Team 1"} vs ${game.team_2?.name || "Team 2"}`, `Game Score: ${game.game.score}`, `Why: ${game.game.reasons.join(" • ")}`].join("\\n");
}

function weeklyEloPost(users, assignments, results) {
  const rows = userEloRows(users, assignments, results).slice(0,10);
  return ["⚡ CFBElite User ELO Top 10", "", ...rows.map((row,index)=>`${index+1}. ${row.discord} — ${row.elo}`)].join("\\n");
}

function EloRankings({ users, teams, assignments, results }) {
  const rows = userEloRows(users, assignments, results);
  const activeTeamByUser = new Map(assignments.filter((row)=>row.status === "Active").map((row)=>[row.discord_user_id, teams.find((team)=>team.id===row.team_id)]));
  return <section style={card}><h2 style={sectionTitle}>User ELO Rankings</h2><p style={mutedText}>ELO is rebuilt automatically from every recorded result in chronological order. Everyone starts at 1500. Upsets and margin of victory affect movement.</p><Table headers={["#", "Discord User", "Current Team", "Adjusted ELO", "Current ELO", "Peak ELO", "Tier", "Record"]}>{rows.map((row,index)=>{ const team = activeTeamByUser.get(row.user.id); const tier = userTierFromElo(row.elo, index + 1); return <tr key={row.user.id} style={trStyle}><td style={rankCell}>#{index + 1}</td><td style={teamCell}>{row.discord}</td><td style={teamCell}>{team ? <TeamLabel team={team}/> : "—"}</td><td style={scoreCell}>{row.adjustedElo}</td><td style={td}>{row.elo}</td><td style={td}>{row.peakElo}</td><td style={td}>{tier.label}</td><td style={td}>{row.wins}-{row.losses}</td></tr>; })}</Table></section>;
}

function WeeklyMatchups({ rows, newMatchup, setNewMatchup, teams, users, assignments, results, currentYear, currentWeek, addMatchup, deleteRow, matchupImportText, setMatchupImportText, importWeeklyMatchups }) {
  const currentRows = weeklyMatchupRows(rows, teams, users, assignments, results, currentYear, currentWeek);
  return <section style={card}><div style={sectionTop}><div><h2 style={sectionTitle}>Weekly Matchups</h2><p style={mutedText}>Enter scheduled user games for the week. Game of the Week is selected automatically by score.</p></div><button style={button} onClick={addMatchup}>Add Matchup</button></div>
    <div style={filterGrid}>
      <select style={input} value={newMatchup.season_year} onChange={(e)=>setNewMatchup({...newMatchup, season_year:e.target.value})}>{YEARS.map((year)=><option key={year}>{year}</option>)}</select>
      <select style={input} value={newMatchup.week} onChange={(e)=>setNewMatchup({...newMatchup, week:e.target.value})}>{WEEKS.map((week)=><option key={week}>{week}</option>)}</select>
      <select style={input} value={newMatchup.team_1_id} onChange={(e)=>setNewMatchup({...newMatchup, team_1_id:e.target.value})}><option value="">Team 1</option>{teams.map((team)=><option key={team.id} value={team.id}>{team.name}</option>)}</select>
      <select style={input} value={newMatchup.team_2_id} onChange={(e)=>setNewMatchup({...newMatchup, team_2_id:e.target.value})}><option value="">Team 2</option>{teams.map((team)=><option key={team.id} value={team.id}>{team.name}</option>)}</select>
      <select style={input} value={newMatchup.team_1_user_id} onChange={(e)=>setNewMatchup({...newMatchup, team_1_user_id:e.target.value})}><option value="">User 1 optional</option>{users.map((user)=><option key={user.id} value={user.id}>{user.discord_username}</option>)}</select>
      <select style={input} value={newMatchup.team_2_user_id} onChange={(e)=>setNewMatchup({...newMatchup, team_2_user_id:e.target.value})}><option value="">User 2 optional</option>{users.map((user)=><option key={user.id} value={user.id}>{user.discord_username}</option>)}</select>
    </div>
    <div style={miniCard}>
      <h3 style={miniTitle}>Paste Schedule Import</h3>
      <p style={mutedText}>One matchup per line. Example: Alabama Crimson Tide vs Clemson Tigers. Usernames can be included but are optional.</p>
      <textarea value={matchupImportText} onChange={(e)=>setMatchupImportText(e.target.value)} style={recapBox} placeholder={"Alabama Crimson Tide vs Clemson Tigers\nOhio State Buckeyes vs Michigan Wolverines"} />
      <button style={button} onClick={importWeeklyMatchups}>Import Matchups</button>
    </div>
    <Table headers={["Game Score", "Team 1", "Team 2", "Why", "Delete"]}>{currentRows.map((row)=><tr key={row.id} style={trStyle}><td style={scoreCell}>{row.game.score}</td><td style={teamCell}><TeamLabel team={row.team_1}/><div style={mutedText}>{row.user_1?.discord_username || matchupUserLabel(row.team_1_user_id, users)}</div></td><td style={teamCell}><TeamLabel team={row.team_2}/><div style={mutedText}>{row.user_2?.discord_username || matchupUserLabel(row.team_2_user_id, users)}</div></td><td style={td}>{row.game.reasons.join(" • ")}</td><td style={td}><button style={dangerButton} onClick={()=>{ if(window.confirm("Delete this scheduled matchup?")) deleteRow("weekly_matchups", row.id); }}>Delete</button></td></tr>)}</Table>
  </section>;
}

function RankingsMovementReport({ teams, results, currentWeek, assignments = [], users = [] }) {
  const current = computerRankingRows(teams, results, assignments, users);
  const previous = computerRankingRows(teams, results.filter((result)=>weekIndex(result.week) < weekIndex(currentWeek)), assignments, users);
  const prevMap = new Map(previous.map((row)=>[row.team.id, row.rank]));
  const movers = current.map((row)=>({ ...row, previousRank: prevMap.get(row.team.id), movement: prevMap.get(row.team.id) ? prevMap.get(row.team.id) - row.rank : null }));
  const risers = movers.filter((row)=>row.movement > 0).sort((a,b)=>b.movement-a.movement).slice(0,5);
  const fallers = movers.filter((row)=>row.movement < 0).sort((a,b)=>a.movement-b.movement).slice(0,5);
  const news = movers.filter((row)=>row.previousRank == null).slice(0,5);
  return <section style={card}><h2 style={sectionTitle}>Rankings Movement Report</h2><div style={threeCol}><LeaderboardCard title="Biggest Risers" rows={risers.map((r)=>({team:r.teamName,total:`▲ ${r.movement}`}))}/><LeaderboardCard title="Biggest Fallers" rows={fallers.map((r)=>({team:r.teamName,total:`▼ ${Math.abs(r.movement)}`}))}/><LeaderboardCard title="New This Week" rows={news.map((r)=>({team:r.teamName,total:"NEW"}))}/></div></section>;
}

function weeklyRecapText({ teams, users, assignments, results, weeklyMatchups, currentYear, currentWeek }) {
  const weekResults = results.filter((row)=>String(row.season_year) === String(currentYear) && row.week === currentWeek);
  const gotw = weeklyMatchupRows(weeklyMatchups, teams, users, assignments, results, currentYear, currentWeek)[0];
  const rankings = computerRankingRows(teams, results, assignments, users).slice(0,10);
  const eloTop = userEloRows(users, assignments, results).slice(0,5);
  const lines = [`🏈 CFBElite ${currentYear} ${currentWeek} Recap`, ""];
  if (gotw) lines.push(`🔥 Game of the Week: ${gotw.team_1?.name || "Team 1"} vs ${gotw.team_2?.name || "Team 2"} (${gotw.game.score} score)`, "");
  if (weekResults.length) {
    lines.push("Finals:");
    weekResults.slice(0,12).forEach((r)=>lines.push(`• ${r.team_1?.name || "Team 1"} ${r.team_1_score} - ${r.team_2_score} ${r.team_2?.name || "Team 2"}`));
    lines.push("");
  } else {
    lines.push("No results recorded yet for this week.", "");
  }
  lines.push("Top 10 Computer Rankings:");
  rankings.forEach((r)=>lines.push(`${r.rank}. ${r.teamName} (${r.wins}-${r.losses}) — ${r.score.toFixed(1)}`));
  lines.push("", "Top 5 User ELO:");
  eloTop.forEach((r, index)=>lines.push(`${index + 1}. ${r.discord} — ${r.elo}`));
  return lines.join("\\n");
}


function RecruitingRankings({ rows, teams, users, assignments, currentYear }) {
  const [draft, setDraft] = useState({ team_id: "", season_year: currentYear, rank: "" });
  const yearRows = rows.filter((row)=>String(row.season_year) === String(currentYear)).sort((a,b)=>Number(a.rank||999)-Number(b.rank||999));
  const bestByCoach = rows.filter((row)=>Number(row.rank)>0).map((row)=>{
    const assignment = coachForTeamYear(row.team_id, row.season_year, assignments);
    return { ...row, coach: assignment?.discord_users?.discord_username || users.find((u)=>u.id===assignment?.discord_user_id)?.discord_username || "Unassigned" };
  }).sort((a,b)=>Number(a.rank)-Number(b.rank)).slice(0,15);

  async function addRecruitingClass() {
    if (!draft.team_id || !draft.rank || !draft.season_year) return;
    const { error } = await supabase.from("recruiting_classes").insert({
      team_id: draft.team_id,
      season_year: Number(draft.season_year),
      rank: Number(draft.rank),
    });
    if (error) alert(`Recruiting add failed: ${error.message}`);
    else window.location.reload();
  }

  return <section style={card}><h2 style={sectionTitle}>Recruiting Class Rankings</h2><p style={mutedText}>Add class ranks here and they automatically translate to team pages, coach profiles, and conference power.</p>
    <div style={miniCard}>
      <h3 style={miniTitle}>Add Recruiting Class</h3>
      <div style={filterGrid}>
        <select style={input} value={draft.team_id} onChange={(e)=>setDraft({...draft, team_id:e.target.value})}><option value="">Select Team</option>{teams.map((team)=><option key={team.id} value={team.id}>{team.name}</option>)}</select>
        <select style={input} value={draft.season_year} onChange={(e)=>setDraft({...draft, season_year:e.target.value})}>{YEARS.map((year)=><option key={year}>{year}</option>)}</select>
        <input style={input} value={draft.rank} onChange={(e)=>setDraft({...draft, rank:e.target.value})} placeholder="Class Rank"/>
        <button style={button} onClick={addRecruitingClass}>Add Class</button>
      </div>
    </div>
    <div style={twoCol}><div style={miniCard}><h3 style={miniTitle}>{currentYear} Rankings</h3>{yearRows.length ? yearRows.slice(0,25).map((row)=><div key={row.id} style={leaderRow}><span>#{row.rank} {row.teams?.name || teamNameById(row.team_id, teams)}</span></div>) : <div style={miniRow}>No recruiting data for {currentYear} yet.</div>}</div><div style={miniCard}><h3 style={miniTitle}>Best Classes Logged</h3>{bestByCoach.length ? bestByCoach.map((row)=><div key={row.id} style={leaderRow}><span>#{row.rank} {row.teams?.name || teamNameById(row.team_id, teams)} · {row.season_year}</span><b>{row.coach}</b></div>) : <div style={miniRow}>No recruiting data yet.</div>}</div></div></section>;
}

function DynastyTimeline({ results, teams, allAmericans, awards, heismans, nationalChampions, recruiting }) {
  const events = [
    ...nationalChampions.map((row)=>({year:row.season_year, type:"National Champion", text:`${row.teams?.name || teamNameById(row.team_id, teams)} won the national championship.`})),
    ...heismans.map((row)=>({year:row.season_year, type:"Heisman", text:`${row.player_name} (${row.teams?.name || teamNameById(row.team_id, teams)}) won the Heisman.`})),
    ...awards.map((row)=>({year:row.season_year, type:"Award", text:`${row.player_name} won ${row.award_name} for ${row.teams?.name || teamNameById(row.team_id, teams)}.`})),
    ...results.filter((row)=>row.week==="Conference Championship Week" || row.week==="National Championship Week").map((row)=>{
      const s1=Number(row.team_1_score||0), s2=Number(row.team_2_score||0);
      const winner=s1>=s2 ? row.team_1?.name : row.team_2?.name;
      return {year:row.season_year, type:row.week, text:`${winner || "A team"} won ${row.week}, ${Math.max(s1,s2)}-${Math.min(s1,s2)}.`};
    }),
  ].filter((e)=>e.year).sort((a,b)=>Number(b.year)-Number(a.year));
  return <section style={card}><h2 style={sectionTitle}>Dynasty Timeline</h2><p style={mutedText}>Automatically generated from championships, Heismans, awards, and title games.</p><div style={timelineList}>{events.slice(0,60).map((event,index)=><div key={`${event.year}-${event.type}-${index}`} style={timelineItem}><div style={timelineYear}>{event.year}</div><div><b>{event.type}</b><div style={mutedText}>{event.text}</div></div></div>)}</div></section>;
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


function expectedEloScore(playerElo, opponentElo) {
  return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
}

function userEloRows(users, assignments, results) {
  const userMap = new Map();
  users.forEach((user) => userMap.set(user.id, { user, elo: 1500, peakElo: 1500, wins: 0, losses: 0, games: 0 }));

  const ordered = [...results].sort((a, b) => {
    const yearDiff = Number(a.season_year || 0) - Number(b.season_year || 0);
    if (yearDiff !== 0) return yearDiff;
    const weekDiff = weekIndex(a.week) - weekIndex(b.week);
    if (weekDiff !== 0) return weekDiff;
    return new Date(a.created_at || 0) - new Date(b.created_at || 0);
  });

  ordered.forEach((result) => {
    const team1UserId = result.team_1_user_id || coachForTeamYear(result.team_1_id, result.season_year, assignments)?.discord_user_id;
    const team2UserId = result.team_2_user_id || coachForTeamYear(result.team_2_id, result.season_year, assignments)?.discord_user_id;
    if (!team1UserId || !team2UserId || team1UserId === team2UserId) return;

    if (!userMap.has(team1UserId)) userMap.set(team1UserId, { user: { id: team1UserId, discord_username: "Unassigned" }, elo: 1500, peakElo: 1500, wins: 0, losses: 0, games: 0 });
    if (!userMap.has(team2UserId)) userMap.set(team2UserId, { user: { id: team2UserId, discord_username: "Unassigned" }, elo: 1500, peakElo: 1500, wins: 0, losses: 0, games: 0 });

    const row1 = userMap.get(team1UserId);
    const row2 = userMap.get(team2UserId);
    const s1 = Number(result.team_1_score || 0);
    const s2 = Number(result.team_2_score || 0);
    if (s1 === s2) return;

    const outcome1 = s1 > s2 ? 1 : 0;
    const outcome2 = s2 > s1 ? 1 : 0;
    const margin = Math.abs(s1 - s2);
    const expected1 = expectedEloScore(row1.elo, row2.elo);
    const expected2 = expectedEloScore(row2.elo, row1.elo);

    const marginMultiplier = Math.min(1.45, 1 + Math.log2(margin + 1) * 0.07);
    const upsetMultiplier1 = outcome1 === 1 && row1.elo < row2.elo ? 1.12 : 1;
    const upsetMultiplier2 = outcome2 === 1 && row2.elo < row1.elo ? 1.12 : 1;
    const activityDampener1 = row1.games < 3 ? 0.88 : 1;
    const activityDampener2 = row2.games < 3 ? 0.88 : 1;

    const k1 = 24 * marginMultiplier * upsetMultiplier1 * activityDampener1;
    const k2 = 24 * marginMultiplier * upsetMultiplier2 * activityDampener2;

    row1.elo = Math.round(row1.elo + k1 * (outcome1 - expected1));
    row2.elo = Math.round(row2.elo + k2 * (outcome2 - expected2));
    row1.peakElo = Math.max(row1.peakElo, row1.elo);
    row2.peakElo = Math.max(row2.peakElo, row2.elo);

    row1.games += 1;
    row2.games += 1;
    if (outcome1) { row1.wins += 1; row2.losses += 1; }
    else { row2.wins += 1; row1.losses += 1; }
  });

  return [...userMap.values()]
    .map((row) => ({
      ...row,
      discord: row.user.discord_username,
      winPct: row.games ? row.wins / row.games : 0,
      experienceScore: Math.min(100, row.games * 4),
      adjustedElo: Math.round((row.elo * 0.90) + (Math.min(1700, 1500 + row.games * 4) * 0.10)),
    }))
    .sort((a, b) => b.adjustedElo - a.adjustedElo || b.elo - a.elo || b.wins - a.wins || a.discord.localeCompare(b.discord));
}

function userEloMap(users, assignments, results) {
  return new Map(userEloRows(users, assignments, results).map((row) => [row.user.id, row.elo]));
}

function userTierFromElo(elo, rank = 32) {
  if (rank <= 8 || elo >= 1600) return { label: "Tier 1", score: 100 };
  if (rank <= 16 || elo >= 1500) return { label: "Tier 2", score: 75 };
  if (rank <= 24 || elo >= 1400) return { label: "Tier 3", score: 50 };
  return { label: "Tier 4", score: 25 };
}


function opponentUserTierScore(teamId, results, assignments, users = []) {
  if (!assignments?.length || !results?.length) return 50;

  const eloRows = userEloRows(users, assignments, results);
  const eloMap = new Map(eloRows.map((row) => [row.user.id, row.elo]));
  const rankMap = new Map(eloRows.map((row, index) => [row.user.id, index + 1]));

  const games = results.filter((result) => result.team_1_id === teamId || result.team_2_id === teamId);
  if (!games.length) return 50;

  const total = games.reduce((sum, result) => {
    const isTeam1 = result.team_1_id === teamId;
    const opponentTeamId = isTeam1 ? result.team_2_id : result.team_1_id;
    const opponentUserId = isTeam1
      ? (result.team_2_user_id || coachForTeamYear(opponentTeamId, result.season_year, assignments)?.discord_user_id)
      : (result.team_1_user_id || coachForTeamYear(opponentTeamId, result.season_year, assignments)?.discord_user_id);
    const tier = userTierFromElo(eloMap.get(opponentUserId) || 1500, rankMap.get(opponentUserId) || 32);
    return sum + tier.score;
  }, 0);

  return total / games.length;
}

function computerRankingRows(teams, results, assignments = [], users = []) {
  const base = teams.map((team) => {
    const rec = recordFromResults(team.id, results);
    const games = rec.games || 0;
    const winPct = games ? rec.wins / games : 0;
    const avgPf = Number(rec.avgPf);
    const avgPa = Number(rec.avgPa);
    const sor = Number(strengthOfResult(team.id, teams, results)) || 0;
    const qw = qualityWins(team.id, results);
    const margin = avgPf - avgPa;
    const userTierScore = opponentUserTierScore(team.id, results, assignments, users);
    const score =
      (winPct * 38) +
      (sor * 2.8) +
      (qw * 6.5) +
      (Math.max(-20, Math.min(30, margin)) * 0.38) +
      (rec.wins * 1.2) +
      (userTierScore * 0.24);
    return { team, teamName: team.name, wins: rec.wins, losses: rec.losses, games, avgPf, avgPa, top25: top25Wins(team.id, results), qw, sor, userTierScore: Number(userTierScore.toFixed(1)), score: Number(score.toFixed(1)) };
  });
  return base.sort((a,b)=>b.score-a.score || b.wins-a.wins || a.losses-b.losses || a.teamName.localeCompare(b.teamName)).map((row,index)=>({...row, rank:index+1}));
}

function LeaguePulse({ teams, results, allAmericans = [], awards = [], currentYear, assignments = [], users = [] }) {
  const rows = computerRankingRows(teams, results, assignments, users);
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

function ComputerRankings({ teams, results, currentWeek, sortState, setSortState, assignments = [], users = [] }) {
  const baseRows = computerRankingRows(teams, results, assignments, users);
  const previousResults = results.filter((result) => weekIndex(result.week) < weekIndex(currentWeek));
  const previousRows = computerRankingRows(teams, previousResults, assignments, users);
  const previousRankMap = new Map(previousRows.map((row) => [row.team.id, row.rank]));
  const activeSort = sortState?.key ? sortState : { key: "score", direction: "desc" };
  const rows = [...baseRows].sort((a,b)=>compareForSort(a,b,activeSort.key,activeSort.direction));
  return <section style={card}><div style={sectionTop}><div><h2 style={sectionTitle}>CFBElite Computer Rankings</h2><p style={mutedText}>Automated 32-user ranking. Formula: record, SOR, quality wins, scoring margin, wins, and opponent user ELO tier strength. Movement compares current rank to the rank through the previous league week.</p></div></div><Table headers={["#","Move",<SortButton label="Team" sortKey="teamName" sortState={activeSort} setSortState={setSortState}/>,<SortButton label="Record" sortKey="record" sortState={activeSort} setSortState={setSortState}/>,<SortButton label="QW" sortKey="qw" sortState={activeSort} setSortState={setSortState}/>,<SortButton label="Avg PF" sortKey="avgPf" sortState={activeSort} setSortState={setSortState}/>,<SortButton label="Avg PA" sortKey="avgPa" sortState={activeSort} setSortState={setSortState}/>,<SortButton label="SOR" sortKey="sor" sortState={activeSort} setSortState={setSortState}/>,<SortButton label="Score" sortKey="score" sortState={activeSort} setSortState={setSortState}/>]}>{rows.map((row)=><tr key={row.team.id} style={trStyle}><td style={rankCell}>#{row.rank}</td><td style={td}><MovementBadge currentRank={row.rank} previousRank={previousRankMap.get(row.team.id)}/></td><td style={teamCell}><TeamLabel team={row.team}/></td><td style={td}>{row.wins}-{row.losses}</td><td style={td}>{row.qw}</td><td style={td}>{row.avgPf.toFixed(1)}</td><td style={td}>{row.avgPa.toFixed(1)}</td><td style={td}>{row.sor.toFixed(1)}</td><td style={scoreCell}>{row.score.toFixed(1)}</td></tr>)}</Table></section>;
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

function top25RecruitingClassesForCoach(user, recruiting, assignments) {
  return recruiting.filter((row) => {
    if (!(Number(row.rank) >= 1 && Number(row.rank) <= 25)) return false;
    const coach = coachForTeamYear(row.team_id, row.season_year, assignments);
    return coach?.discord_user_id === user.id;
  }).length;
}

function CoachProfile({ user, users = [], teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting }) {
  const coachStats = getCoachStats(usersFallback(user), teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting);
  const stats = coachStats.find((row)=>row.userId === user.id) || { wins:0, losses:0, nattys:0, confTitles:0, top25Wins:0, awards:0, allAmericans:0, heismans:0, prestige:0 };
  const activeAssignment = assignments.find((a)=>a.discord_user_id===user.id && a.status==="Active");
  const currentTeam =
    teams.find((t)=>t.id===activeAssignment?.team_id) ||
    activeAssignment?.teams ||
    activeAssignment?.team ||
    null;
  const timeline = assignments.filter((a)=>a.discord_user_id===user.id).sort((a,b)=>Number(a.start_year||0)-Number(b.start_year||0));
  const coachResults = results.filter((result) => {
    const team1UserId = result.team_1_user_id || coachForTeamYear(result.team_1_id, result.season_year, assignments)?.discord_user_id;
    const team2UserId = result.team_2_user_id || coachForTeamYear(result.team_2_id, result.season_year, assignments)?.discord_user_id;
    return team1UserId === user.id || team2UserId === user.id;
  });
  const coachAA = rowsForCoachUser(allAmericans, user, assignments);
  const coachAwards = rowsForCoachUser(awards, user, assignments);
  const coachHeismans = rowsForCoachUser(heismans, user, assignments);
  const coachEloRow = userEloRows(usersFallback(user), assignments, results).find((row)=>row.user.id === user.id);
  const coachTier = userTierFromElo(coachEloRow?.elo || 1500, 1);
  const currentSeasonRecord = currentTeam ? recordFromResults(currentTeam.id, results.filter((row)=>String(row.season_year) === String(new Date().getFullYear()))) : { wins:0, losses:0 };

  const primary = getTeamPrimary(currentTeam);
  const secondary = getTeamSecondary(currentTeam);
  const accent = currentTeam?.accent_color || secondary || "#facc15";
  const teamThemedProfile = currentTeam ? {
    ...profileCard,
    background: `radial-gradient(circle at top left, ${accent}22, transparent 28%), linear-gradient(155deg, ${primary} 0%, ${primary}e8 34%, rgba(2,6,23,.96) 100%)`,
    border: `1px solid ${accent}88`,
    boxShadow: `0 28px 90px ${primary}77, inset 0 0 0 1px ${accent}22`,
  } : profileCard;

  return <section style={teamThemedProfile}>
    <div style={teamProfileHeroClean}>
      <div>
        <div style={{...eyebrow, color: accent, letterSpacing:".18em"}}>Coach Profile</div>
        <h2 style={teamProfileName}>{user.discord_username}</h2>
        <p style={teamProfileSubline}><span>Current Team</span><b>{currentTeam?.name || "Unassigned"}</b></p>
      </div>
      <div style={badgeRow}>
        <span style={teamBadgeBubble}>{currentTeam?.conference || "CFBElite"}</span>
        <span style={teamBadgeBubble}>Record {stats?.wins||0}-{stats?.losses||0}</span>
        <span style={teamBadgeBubble}>ELO {coachEloRow?.adjustedElo || coachEloRow?.elo || 1500}</span>
        <span style={teamBadgeBubble}>{coachTier.label}</span>
      </div>
    </div>
    <div style={statsGrid}><Stat title="Career Record" value={`${stats?.wins||0}-${stats?.losses||0}`}/><Stat title="National Titles" value={stats?.nattys||0}/><Stat title="Conference Titles" value={stats?.confTitles||0}/><Stat title="Top 25 Wins" value={stats?.top25Wins||0}/><Stat title="Awards" value={stats?.awards||0}/><Stat title="All-Americans" value={stats?.allAmericans||0}/><Stat title="Heismans" value={stats?.heismans||0}/><Stat title="Top 25 Recruiting Classes" value={top25RecruitingClassesForCoach(user, recruiting, assignments)}/></div>
    <CoachTimelineTable timeline={timeline} teams={teams} results={results} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions}/>
    <Results rows={coachResults} deleteResult={()=>{}} search="" setSearch={()=>{}}/>
    <RivalryBadges user={user} users={usersFallback(user)} allUsers={users} results={results} assignments={assignments}/><BestWorstPanel user={user} results={results} assignments={assignments}/><CoachTimelineEvents user={user} teams={teams} results={results} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions} assignments={assignments}/><RecognitionTable title="All-Americans" headers={["Player","Position","Team","Year","Type"]} rows={coachAA.map((r)=>({id:r.id,cells:[r.player_name,r.position,teamNameById(r.team_id,teams),r.season_year,r.type]}))}/>
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
    .filter((row)=>row.hofCriteria.qualifies && row.rawPrestige >= 95)
    .sort((a,b)=>b.rawPrestige-a.rawPrestige || b.wins-a.wins);
  return <section style={card}><h2 style={sectionTitle}>Coach Hall of Fame</h2><p style={mutedText}>Coaches qualify automatically by meeting tougher benchmarks: 2 national titles, 1 title plus 3 conference titles, 50 career wins, 20 Top 25 wins, 100+ HOF score, or 25+ major accolades with 25+ wins.</p>{rows.length ? <div style={hofGrid}>{rows.map((row)=><CoachHofCard key={row.userId || row.discord} row={row} teams={teams} assignments={assignments}/>)}</div> : <div style={miniRow}>No coaches have met Hall of Fame criteria yet.</div>}</section>;
}


function hofProbability(score, type = "coach") {
  const lock = type === "coach" ? 95 : 80;
  const likely = type === "coach" ? 70 : 55;
  const fringe = type === "coach" ? 45 : 35;
  if (score >= lock) return { label: "LOCK", style: hofLock };
  if (score >= likely) return { label: "LIKELY", style: hofLikely };
  if (score >= fringe) return { label: "FRINGE", style: hofFringe };
  return { label: "WATCH", style: hofWatch };
}

function HofProbabilityBadge({ score, type }) {
  const row = hofProbability(score, type);
  return <span style={row.style}>{row.label}</span>;
}

function coachHofPointBreakdown(row) {
  return [
    { label: "National Titles", count: row.nattys, points: row.nattys * 30 },
    { label: "Conference Titles", count: row.confTitles, points: row.confTitles * 15 },
    { label: "Top 25 Wins", count: row.top25Wins, points: row.top25Wins * 4 },
    { label: "Wins", count: row.wins, points: Number((row.wins * 1.5).toFixed(1)) },
    { label: "Bowl Wins", count: row.bowlWins, points: row.bowlWins * 3 },
    { label: "Heismans", count: row.heismans, points: row.heismans * 12 },
    { label: "Awards", count: row.awards, points: row.awards * 4 },
    { label: "All-Americans", count: row.allAmericans, points: row.allAmericans * 2 },
  ].filter((item)=>Number(item.points) > 0);
}

function playerHofPointBreakdown(row) {
  return [
    { label: "Heismans", count: row.heismans.length, points: row.heismans.length * 24 },
    { label: "Awards", count: row.awards.length, points: row.awards.length * 9 },
    { label: "All-Americans", count: row.allAmericans.length, points: row.allAmericans.length * 6 },
    { label: "National Titles", count: row.nattys, points: row.nattys * 8 },
    { label: "Conference Titles", count: row.confTitles, points: row.confTitles * 4 },
  ].filter((item)=>Number(item.points) > 0);
}

function HofBreakdown({ rows }) {
  return <div style={hofBreakdown}>{rows.map((item)=><div key={item.label} style={leaderRow}><span>{item.label}: {item.count}</span><b>{item.points} pts</b></div>)}</div>;
}

function CoachHofCard({ row, teams, assignments }) {
  const activeAssignment = assignments.find((a)=>a.discord_user_id===row.userId && a.status==="Active");
  const team = teams.find((t)=>t.id===activeAssignment?.team_id);

  return (
    <div style={hofCardClean}>
      <div style={hofCardHeader}>
        <div style={{ minWidth: 0 }}>
          <div style={eyebrow}>Coach Hall of Fame</div>
          <h3 style={hofNameClean}>{row.discord}</h3>
          <div style={hofSubText}>{team?.name || row.activeTeamsText || "No active team"}</div>
        </div>

        <div style={hofScoreBox}>
          <span>HOF Score</span>
          <b>{Math.round(row.rawPrestige)}</b>
        </div>
      </div>

      <div style={hofReasonClean}>{row.hofCriteria.reasons.join(" • ")}</div><HofBreakdown rows={coachHofPointBreakdown(row)}/>

      <div style={hofChips}>
        <Chip label="Career" value={`${row.wins}-${row.losses}`}/>
        <Chip label="Nattys" value={row.nattys}/>
        <Chip label="Conf" value={row.confTitles}/>
        <Chip label="Top 25" value={row.top25Wins}/>
        <Chip label="Bowl" value={`${row.bowlWins}-${row.bowlLosses}`}/>
        <Chip label="Heisman" value={row.heismans}/>
        <Chip label="Awards" value={row.awards}/>
        <Chip label="All-Americans" value={row.allAmericans}/>
      </div>
    </div>
  );
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
  const rows = playerHallRows(teams, assignments, results, allAmericans, awards, heismans, nationalChampions).filter((row)=>row.score >= 80);
  return <section style={card}><h2 style={sectionTitle}>Player Hall of Fame</h2><p style={mutedText}>Players qualify automatically by tougher benchmarks: Heisman plus supporting accolades, 3 major awards, 4 All-American selections, elite title-season accolades, or 60+ HOF score.</p>{rows.length ? <div style={hofGrid}>{rows.map((row)=><PlayerHofCard key={row.key} row={row} team={teams.find((t)=>t.id===row.teamId)}/>)}</div> : <div style={miniRow}>No players have met Hall of Fame criteria yet.</div>}</section>;
}
function PlayerHofCard({ row, team }) {
  return (
    <div style={hofCardClean}>
      <div style={hofCardHeader}>
        <div style={{ minWidth: 0 }}>
          <div style={eyebrow}>Player Hall of Fame</div>
          <h3 style={hofNameClean}>{row.player}</h3>
          <div style={hofSubText}>{row.position} · {team?.name || "Unknown Team"}</div>
        </div>

        <div style={hofScoreBox}>
          <span>HOF Score</span>
          <b>{row.score}</b>
        </div>
      </div>

      <div style={hofReasonClean}>{row.reasons.join(" • ")}</div><HofBreakdown rows={playerHofPointBreakdown(row)}/>

      <div style={hofChips}>
        <Chip label="Heisman" value={row.heismans.length}/>
        <Chip label="Awards" value={row.awards.length}/>
        <Chip label="All-Americans" value={row.allAmericans.length}/>
        <Chip label="Nattys" value={row.nattys}/>
        <Chip label="Conf" value={row.confTitles}/>
      </div>

      <div style={accoladeList}>
        {[...row.heismans, ...row.awards, ...row.allAmericans].slice(0,8).map((x,i)=>
          <div key={i} style={miniRow}>{x}</div>
        )}
      </div>
    </div>
  );
}

function GlobalStyle() {
  return (
    <style>{`
      :root {
        --cfb-font: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
        --cfb-display: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
        --glass-bg: linear-gradient(145deg, rgba(255,255,255,.16), rgba(255,255,255,.045));
        --glass-border: rgba(255,255,255,.18);
        --glass-shadow: 0 28px 90px rgba(0,0,0,.38), inset 0 1px 0 rgba(255,255,255,.16);
      }

      * {
        box-sizing: border-box;
      }

      html, body, #root {
        min-height: 100%;
        font-family: var(--cfb-font);
        text-rendering: geometricPrecision;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      body {
        background:
          radial-gradient(circle at 10% 0%, rgba(124,58,237,.34), transparent 32%),
          radial-gradient(circle at 90% 10%, rgba(250,204,21,.12), transparent 28%),
          radial-gradient(circle at 50% 100%, rgba(59,130,246,.16), transparent 36%),
          #090615;
      }

      button, input, select, textarea {
        font-family: var(--cfb-font);
      }

      button {
        transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease, filter .18s ease;
      }

      button:hover {
        transform: translateY(-1px);
        filter: brightness(1.07);
      }

      button:active {
        transform: translateY(0) scale(.99);
      }

      table {
        border-collapse: separate;
        border-spacing: 0;
      }

      @supports not ((backdrop-filter: blur(20px))) {
        .glass-fallback {
          background: rgba(15,23,42,.92) !important;
        }
      }

      @media (max-width: 720px) {
        .hide-on-mobile-table {
          display: none !important;
        }
      }
    `}</style>
  );
}

function Header({ loading, reload }) {
  return (
    <header style={heroBanner}>
      <img src="/cfbelite-banner.png" alt="CFBElite 27 Dynasty" style={heroBannerImage} />
      <div style={heroOverlay} />

      <div style={heroContent}>
        <button onClick={reload} style={statusBox}>
          {loading ? "Loading..." : "LIVE DATABASE"}
        </button>
      </div>
    </header>
  );
}
function TabBar({ tabs, activeTab, setActiveTab, draggedTab, setDraggedTab, reorderTabs, adminUnlocked, adminCodeInput, setAdminCodeInput, unlockAdmin, teams = [], assignments = [], currentYear }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const groups = [
    { title: "Main", keys: ["dashboard", "draftRoom"] },
    { title: "Media", keys: [ "weeklyMatchups", "recruitingRankings", "dynastyTimeline"] },
    { title: "Dynasty Legacy", keys: ["dynastyRecords", "rivalries", "powerIndex",  "coachingTree"] },
    { title: "Rankings", keys: ["eloRankings", "conferencePower"] },
    { title: "League History", keys: ["coachHOF", "playerHOF", "h2h"] },
    { title: "Recognition", keys: ["allAmericans", "awards", "heismans", "nationalChampions"] },
    { title: "Admin", keys: ["assignments"] },
  ];

  const tabMap = new Map(tabs);
  const hiddenWhenLocked = new Set(["weeklyMatchups", "assignments", "commissionerCenter"]);
  const visibleGroups = groups.map((group) => ({ ...group, keys: group.keys.filter((key) => adminUnlocked || !hiddenWhenLocked.has(key)) })).filter((group) => group.keys.length > 0);
  const usedKeys = new Set(visibleGroups.flatMap((group) => group.keys));
  const coachTabs = tabs.filter(([key]) => key.startsWith("coach-"));
  const otherTabs = tabs.filter(([key]) => !usedKeys.has(key) && !key.startsWith("coach-"));

  function handleSelect(key) {
    setActiveTab(key);
    setMenuOpen(false);
  }

  function navThemeFor(tabKey) {
    const premium = ["#20114f", "#facc15", "#ffffff"];
    const admin = ["#2a123f", "#f97316", "#ffffff"];
    const recognition = ["#111827", "#c4b5fd", "#ffffff"];
    const ranking = ["#0f172a", "#22d3ee", "#ffffff"];

    if (["commissionerCenter", "assignments", "weeklyMatchups"].includes(tabKey)) return admin;
    if (["eloRankings", "conferencePower", "powerIndex"].includes(tabKey)) return ranking;
    if (["coachHOF", "playerHOF", "allAmericans", "awards", "heismans", "nationalChampions"].includes(tabKey)) return recognition;
    return premium;
  }

  function NavButton({ tabKey, label }) {
    const [primary, accent, textColor] = navThemeFor(tabKey);
    const active = activeTab === tabKey;

    return (
      <button
        type="button"
        onClick={() => handleSelect(tabKey)}
        style={{
          ...colorDrawerItem,
          background: `linear-gradient(135deg, ${primary}, rgba(15,23,42,.96))`,
          border: `1px solid ${active ? accent : `${accent}77`}`,
          boxShadow: active ? `0 0 0 1px ${accent}66, 0 0 24px ${accent}44` : "0 10px 24px rgba(0,0,0,.18)",
          color: textColor,
        }}
      >
        <span style={{ ...colorDrawerStripe, background: accent }} />
        <span>{label}</span>
        {active && <span style={activeSpark}>●</span>}
      </button>
    );
  }

  function teamForCoachTab(tabKey) {
    const userId = tabKey.replace("coach-", "");
    const assignment =
      assignments.find((row) => row.discord_user_id === userId && assignmentActiveForYear(row, currentYear)) ||
      assignments.find((row) => row.discord_user_id === userId && row.status === "Active");
    return teams.find((team) => team.id === assignment?.team_id);
  }

  function CoachNavButton({ tabKey, label }) {
    const team = teamForCoachTab(tabKey);
    const primary = team?.primary_color || "#111827";
    const secondary = team?.secondary_color || "rgba(250,204,21,.45)";
    const accent = team?.accent_color || "#facc15";
    const active = activeTab === tabKey;

    return (
      <button
        type="button"
        onClick={() => handleSelect(tabKey)}
        style={{
          ...coachDrawerItem,
          background: `linear-gradient(135deg, ${primary}ee, rgba(15,23,42,.96))`,
          border: `1px solid ${active ? accent : secondary}88`,
          boxShadow: active ? `0 0 0 1px ${accent}55, 0 0 24px ${accent}44` : `0 10px 24px rgba(0,0,0,.20)`,
          color: team?.accent_color || "#fff",
        }}
      >
        <span style={{ ...coachAccentStripe, background: accent }} />
        <span style={coachNavTextWrap}>
          <strong style={coachNavName}>{label}</strong>
          <small style={coachNavTeam}>{team?.name || "No active team"}</small>
        </span>
        {active && <span style={activeSpark}>●</span>}
      </button>
    );
  }

  return (
    <>
      <div style={navShell}>
        <button type="button" onClick={() => setMenuOpen(true)} style={hamburgerButton}>
          ☰ Menu
        </button>
        <div style={activePagePill}>
          {tabMap.get(activeTab) || "Dashboard"}
        </div>
      </div>

      {menuOpen && (
        <div style={drawerOverlay} onClick={() => setMenuOpen(false)}>
          <aside style={drawerPanel} onClick={(event) => event.stopPropagation()}>
            <div style={drawerHeader}>
              <div>
                <div style={drawerTitle}>CFBElite 27</div>
                <div style={drawerSubtitle}>League Navigation</div>
              </div>
              <button type="button" onClick={() => setMenuOpen(false)} style={drawerClose}>×</button>
            </div>

            <div style={drawerAdminBox}>
              <div style={drawerGroupTitle}>Commissioner Access</div>
              {adminUnlocked ? (
                <div style={adminUnlockedPill}>Unlocked</div>
              ) : (
                <div style={adminUnlockRow}>
                  <input value={adminCodeInput} onChange={(e)=>setAdminCodeInput(e.target.value)} placeholder="Commissioner code" style={drawerInput}/>
                  <button type="button" onClick={unlockAdmin} style={drawerUnlockButton}>Unlock</button>
                </div>
              )}
            </div>

            <div style={drawerContent}>
              {visibleGroups.filter((group)=>group.keys.length > 0).map((group) => (
                <div key={group.title} style={drawerGroup}>
                  <div style={drawerGroupTitle}>{group.title}</div>
                  {group.keys
                    .filter((key) => tabMap.has(key))
                    .map((key) => <NavButton key={key} tabKey={key} label={tabMap.get(key)} />)}
                </div>
              ))}

              {otherTabs.length > 0 && (
                <div style={drawerGroup}>
                  <div style={drawerGroupTitle}>Other</div>
                  {otherTabs.map(([key, label]) => <NavButton key={key} tabKey={key} label={label} />)}
                </div>
              )}

              <div style={drawerGroup}>
                <div style={drawerGroupTitle}>Coach Profiles</div>
                {coachTabs.length ? coachTabs.map(([key, label]) => (
                  <CoachNavButton key={key} tabKey={key} label={label} />
                )) : <div style={drawerEmpty}>No active coach profiles yet.</div>}
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
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

function Assignments({ rows, teams, users, currentYear, addAssignment, updateRow, deleteRow, drafts, setDrafts, saveDraft, getDraft, teamChange, setTeamChange, changeUserTeam }) {
  const activeRows = rows.filter((row) => assignmentActiveForYear(row, currentYear));
  const hiddenFormerCount = rows.length - activeRows.length;

  return <section style={card}>
    <div style={sectionTop}><div><h2 style={sectionTitle}>Users / Team Assignments</h2><p style={mutedText}>Showing active assignments for {currentYear}. {hiddenFormerCount} former assignment{hiddenFormerCount === 1 ? "" : "s"} stored in history.</p></div><button onClick={addAssignment} style={button}>Add Assignment</button></div>
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
    <Table headers={["Team","Discord User","Status","Start","End","Save",""]}>{activeRows.map((r)=>{const d=getDraft(drafts,r);return <tr key={r.id} style={trStyle}>
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
  opacity: 0.82,
};

const heroOverlay = {
  position: "absolute",
  inset: 0,
  background: "linear-gradient(90deg, rgba(20,8,45,.18), rgba(20,8,45,.10), rgba(5,5,15,.22))",
};

const heroContent = {
  position: "relative",
  zIndex: 2,
  minHeight: 300,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "flex-end",
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


const hofGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 16,
  width: "100%",
  maxWidth: "100%",
};


const navShell = {
  position: "sticky",
  top: 0,
  zIndex: 20,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 18,
  padding: "10px 0",
  backdropFilter: "blur(12px)",
};

const hamburgerButton = {
  border: "1px solid rgba(250,204,21,.34)",
  background: "linear-gradient(135deg, rgba(88,28,135,.95), rgba(15,23,42,.96))",
  color: "#fff",
  borderRadius: 14,
  padding: "12px 16px",
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 12px 30px rgba(0,0,0,.28)",
};

const activePagePill = {
  border: "1px solid rgba(255,255,255,.12)",
  background: "rgba(15,23,42,.76)",
  color: "rgba(255,255,255,.86)",
  borderRadius: 999,
  padding: "10px 14px",
  fontSize: 13,
  fontWeight: 800,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: "60vw",
};

const drawerOverlay = {
  position: "fixed",
  inset: 0,
  zIndex: 999,
  background: "rgba(0,0,0,.62)",
  backdropFilter: "blur(4px)",
};

const drawerPanel = {
  width: "min(390px, 92vw)",
  height: "100%",
  background: "linear-gradient(180deg, #140821, #111827 45%, #050816)",
  borderRight: "1px solid rgba(250,204,21,.25)",
  boxShadow: "24px 0 70px rgba(0,0,0,.45)",
  color: "#fff",
  display: "flex",
  flexDirection: "column",
};

const drawerHeader = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "20px 18px",
  borderBottom: "1px solid rgba(255,255,255,.10)",
};

const drawerTitle = {
  fontSize: 22,
  fontWeight: 950,
  letterSpacing: "-.5px",
};

const drawerSubtitle = {
  marginTop: 3,
  color: "rgba(255,255,255,.62)",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: ".12em",
};

const drawerClose = {
  width: 38,
  height: 38,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,.16)",
  background: "rgba(255,255,255,.08)",
  color: "#fff",
  fontSize: 26,
  lineHeight: "34px",
  cursor: "pointer",
};

const drawerContent = {
  padding: "14px",
  overflowY: "auto",
};

const drawerGroup = {
  marginBottom: 18,
};

const drawerGroupTitle = {
  color: "#facc15",
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: ".14em",
  textTransform: "uppercase",
  margin: "8px 8px",
};

const drawerItem = {
  ...liquidGlassNav,
};

const drawerItemActive = {
  ...liquidGlassNav,
  border: "1px solid rgba(250,204,21,.42)",
  boxShadow: "0 0 0 1px rgba(250,204,21,.20), 0 18px 48px rgba(250,204,21,.12), inset 0 1px 0 rgba(255,255,255,.16)",
};

const drawerEmpty = {
  padding: 12,
  color: "rgba(255,255,255,.56)",
  fontSize: 13,
};

const hofCardClean = {
  width: "100%",
  maxWidth: "100%",
  boxSizing: "border-box",
  overflow: "hidden",
  background: "linear-gradient(160deg, rgba(88,28,135,.72), rgba(15,23,42,.96) 50%, rgba(69,10,10,.72))",
  border: "1px solid rgba(250,204,21,.28)",
  borderRadius: 22,
  padding: 18,
  boxShadow: "0 18px 48px rgba(0,0,0,.34)",
};

const hofCardHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 14,
  width: "100%",
};

const hofNameClean = {
  margin: "6px 0 4px",
  fontSize: "clamp(22px, 5vw, 34px)",
  lineHeight: 1.05,
  fontWeight: 950,
  color: "#fff",
  wordBreak: "break-word",
};

const hofSubText = {
  color: "rgba(255,255,255,.72)",
  fontSize: 13,
  lineHeight: 1.35,
};

const hofScoreBox = {
  flex: "0 0 auto",
  minWidth: 84,
  borderRadius: 16,
  padding: "10px 12px",
  background: "rgba(250,204,21,.12)",
  border: "1px solid rgba(250,204,21,.32)",
  textAlign: "center",
  color: "#fef3c7",
};

const hofReasonClean = {
  marginTop: 14,
  color: "rgba(255,255,255,.76)",
  fontSize: 13,
  lineHeight: 1.45,
};


const filterGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 10,
  margin: "14px 0 18px",
};

const gotwCard = {
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  gap: 16,
  alignItems: "center",
  padding: 18,
  borderRadius: 20,
  border: "1px solid rgba(250,204,21,.25)",
  background: "linear-gradient(135deg, rgba(88,28,135,.55), rgba(15,23,42,.92))",
};

const gotwTeam = {
  display: "grid",
  gap: 8,
  color: "#fff",
  fontWeight: 900,
};

const gotwScore = {
  width: 74,
  height: 74,
  borderRadius: 18,
  display: "grid",
  placeItems: "center",
  background: "rgba(250,204,21,.18)",
  border: "1px solid rgba(250,204,21,.45)",
  color: "#fef3c7",
  fontSize: 24,
  fontWeight: 950,
};

const threeCol = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};

const recapBox = {
  width: "100%",
  minHeight: 260,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,.14)",
  background: "rgba(2,6,23,.72)",
  color: "#fff",
  padding: 14,
  marginBottom: 12,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

const timelineList = {
  display: "grid",
  gap: 12,
  marginTop: 16,
};

const timelineItem = {
  display: "grid",
  gridTemplateColumns: "90px minmax(0, 1fr)",
  gap: 14,
  padding: 14,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,.10)",
  background: "rgba(255,255,255,.045)",
};

const timelineYear = {
  color: "#facc15",
  fontWeight: 950,
  fontSize: 18,
};

const dangerButton = {
  border: "1px solid rgba(248,113,113,.45)",
  background: "rgba(127,29,29,.78)",
  color: "#fecaca",
  borderRadius: 10,
  padding: "9px 12px",
  fontWeight: 900,
  cursor: "pointer",
};


const drawerAdminBox = {
  margin: "12px 14px 0",
  padding: 12,
  borderRadius: 16,
  border: "1px solid rgba(250,204,21,.22)",
  background: "rgba(250,204,21,.07)",
};

const adminUnlockRow = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 8,
};

const drawerInput = {
  minWidth: 0,
  border: "1px solid rgba(255,255,255,.14)",
  background: "rgba(2,6,23,.65)",
  color: "#fff",
  borderRadius: 10,
  padding: "9px 10px",
};

const drawerUnlockButton = {
  border: "1px solid rgba(250,204,21,.35)",
  background: "rgba(250,204,21,.18)",
  color: "#fef3c7",
  borderRadius: 10,
  padding: "9px 10px",
  fontWeight: 900,
  cursor: "pointer",
};

const adminUnlockedPill = {
  color: "#bbf7d0",
  fontWeight: 900,
  padding: "8px 10px",
  borderRadius: 999,
  background: "rgba(22,163,74,.18)",
  border: "1px solid rgba(34,197,94,.32)",
};

const adminLockPanel = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 10,
  maxWidth: 460,
  marginTop: 14,
};

const snapshotGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 10,
};



const headlineList = {
  display: "grid",
  gap: 10,
  marginTop: 12,
};




const coachTreeGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 14,
  marginTop: 16,
};

const coachTreeCard = {
  border: "1px solid rgba(255,255,255,.12)",
  background: "rgba(255,255,255,.055)",
  borderRadius: 20,
  padding: 18,
  display: "grid",
  gap: 8,
  overflow: "hidden",
};

const coachTreeName = {
  color: "#facc15",
  fontSize: "clamp(20px, 6vw, 30px)",
  fontWeight: 950,
  lineHeight: 1.05,
  overflowWrap: "anywhere",
};

const coachTreeRecord = {
  color: "#fff",
  fontWeight: 900,
  fontSize: 16,
};

const coachTreePath = {
  color: "rgba(255,255,255,.72)",
  lineHeight: 1.35,
  overflowWrap: "anywhere",
};

const hofBreakdown = {
  display: "grid",
  gap: 6,
  marginTop: 12,
  paddingTop: 12,
  borderTop: "1px solid rgba(255,255,255,.10)",
};




const homeHeroTitle = {
  margin: "8px 0",
  fontSize: "clamp(34px, 6vw, 72px)",
  lineHeight: .95,
  color: "#fff",
  fontWeight: 950,
};

const homeHeroGrid = {
  display: "grid",
  gap: 12,
};

const homeHeroTile = {
  border: "1px solid rgba(250,204,21,.20)",
  background: "rgba(2,6,23,.45)",
  borderRadius: 18,
  padding: 16,
  display: "grid",
  gap: 6,
};

const tickerWrap = {
  overflow: "hidden",
  border: "1px solid rgba(250,204,21,.18)",
  borderRadius: 16,
  background: "rgba(250,204,21,.08)",
  marginBottom: 18,
};

const tickerContent = {
  display: "flex",
  width: "max-content",
  gap: 28,
  padding: "12px 16px",
  whiteSpace: "nowrap",
  color: "#fef3c7",
  fontWeight: 900,
  animation: "cfbeliteTicker 85s linear infinite",
};



const quickJumpResults = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 8,
  marginTop: 10,
};

const quickJumpButton = {
  border: "1px solid rgba(255,255,255,.12)",
  background: "rgba(255,255,255,.055)",
  color: "#fff",
  borderRadius: 12,
  padding: 10,
  textAlign: "left",
  cursor: "pointer",
  fontWeight: 800,
};

const teamWatermark = {
  position: "absolute",
  right: -30,
  top: -30,
  width: 220,
  height: 220,
  objectFit: "contain",
  opacity: .08,
  pointerEvents: "none",
};

const ringRow = {
  display: "flex",
  gap: 4,
  flexWrap: "wrap",
  fontSize: 22,
};

const rivalryBadgeGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 10,
};

const rivalryBadge = {
  border: "1px solid rgba(250,204,21,.22)",
  background: "rgba(250,204,21,.08)",
  borderRadius: 14,
  padding: 12,
  display: "grid",
  gap: 4,
};

const hofLock = { color:"#bbf7d0", fontWeight:950, fontSize:11, marginTop:4 };
const hofLikely = { color:"#fef3c7", fontWeight:950, fontSize:11, marginTop:4 };
const hofFringe = { color:"#bfdbfe", fontWeight:950, fontSize:11, marginTop:4 };
const hofWatch = { color:"rgba(255,255,255,.65)", fontWeight:950, fontSize:11, marginTop:4 };




const coachAccentStripe = {
  width: 7,
  height: "100%",
  minHeight: 54,
  borderRadius: "0 999px 999px 0",
  boxShadow: "0 0 18px currentColor",
};

const coachNavTextWrap = {
  minWidth: 0,
  display: "grid",
  gap: 4,
};

const coachNavName = {
  fontSize: "clamp(16px, 4.8vw, 24px)",
  lineHeight: 1.05,
  color: "#fff",
  overflowWrap: "anywhere",
  textShadow: "0 2px 12px rgba(0,0,0,.35)",
};

const coachNavTeam = {
  color: "rgba(255,255,255,.78)",
  fontSize: 12,
  fontWeight: 800,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const activeSpark = {
  color: "#facc15",
  fontSize: 12,
  filter: "drop-shadow(0 0 8px rgba(250,204,21,.75))",
};




const mobileCardGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: 10,
  marginBottom: 14,
};










const colorDrawerStripe = {
  width: 7,
  height: "100%",
  minHeight: 42,
  borderRadius: "0 999px 999px 0",
};















const teamProfileHeroClean = {
  borderRadius: 0,
  padding: "4px 0 22px",
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 18,
  alignItems: "start",
  marginBottom: 18,
  background: "transparent",
  border: "none",
  boxShadow: "none",
};


































const teamProfileName = {
  margin: "12px 0 0",
  color: "#fff",
  fontSize: "clamp(46px, 8vw, 82px)",
  lineHeight: .84,
  letterSpacing: "-.055em",
  fontWeight: 1000,
  textShadow: "0 18px 42px rgba(0,0,0,.34)",
};






const teamProfileSubline = {
  margin: "16px 0 0",
  color: "rgba(255,255,255,.86)",
  fontSize: "clamp(15px, 3.1vw, 21px)",
  letterSpacing: "-.01em",
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "baseline",
};

const badgeRow = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  justifyContent: "flex-end",
  alignItems: "center",
  maxWidth: 520,
};

const teamBadgeBubble = {
  minWidth: 118,
  textAlign: "center",
  border: "1px solid rgba(255,255,255,.26)",
  borderRadius: 999,
  padding: "9px 12px",
  color: "#fff",
  background: "rgba(255,255,255,.15)",
  fontWeight: 950,
  fontSize: 12,
  backdropFilter: "blur(14px) saturate(140%)",
  WebkitBackdropFilter: "blur(14px) saturate(140%)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.20)",
};






const liquidGlassPanel = {
  background: "linear-gradient(145deg, rgba(255,255,255,.155), rgba(255,255,255,.045))",
  backdropFilter: "blur(26px) saturate(160%)",
  WebkitBackdropFilter: "blur(26px) saturate(160%)",
  border: "1px solid rgba(255,255,255,.17)",
  borderRadius: 30,
  padding: 24,
  boxShadow: "0 30px 90px rgba(0,0,0,.38), inset 0 1px 0 rgba(255,255,255,.18)",
  marginBottom: 20,
};

const liquidGlassTile = {
  background: "linear-gradient(145deg, rgba(255,255,255,.13), rgba(255,255,255,.04))",
  backdropFilter: "blur(20px) saturate(155%)",
  WebkitBackdropFilter: "blur(20px) saturate(155%)",
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 24,
  padding: 18,
  boxShadow: "0 20px 60px rgba(0,0,0,.30), inset 0 1px 0 rgba(255,255,255,.15)",
};

const liquidGlassNav = {
  width: "100%",
  border: "1px solid rgba(255,255,255,.14)",
  background: "linear-gradient(145deg, rgba(255,255,255,.12), rgba(255,255,255,.04))",
  backdropFilter: "blur(18px) saturate(155%)",
  WebkitBackdropFilter: "blur(18px) saturate(155%)",
  color: "#f8fafc",
  borderRadius: 18,
  padding: "14px 16px",
  fontWeight: 950,
  cursor: "pointer",
  boxShadow: "0 16px 42px rgba(0,0,0,.24), inset 0 1px 0 rgba(255,255,255,.14)",
  textAlign: "left",
};

const glassCard = {
  ...liquidGlassPanel,
};

const glassMiniCard = {
  ...liquidGlassTile,
};

const homeHeroCard = {
  ...liquidGlassPanel,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(280px, .9fr)",
  gap: 18,
  alignItems: "center",
  background: "linear-gradient(135deg, rgba(88,28,135,.58), rgba(255,255,255,.075), rgba(15,23,42,.86))",
};

const quickJumpCard = {
  ...liquidGlassPanel,
  padding: 14,
};

const rankingMobileCard = {
  ...liquidGlassTile,
  padding: 12,
};

const headlineItem = {
  border: "1px solid rgba(255,255,255,.14)",
  background: "linear-gradient(145deg, rgba(255,255,255,.12), rgba(255,255,255,.04))",
  backdropFilter: "blur(18px) saturate(150%)",
  WebkitBackdropFilter: "blur(18px) saturate(150%)",
  color: "rgba(255,255,255,.90)",
  borderRadius: 18,
  padding: 14,
  fontWeight: 850,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.12)",
};

const colorDrawerItem = {
  width: "100%",
  position: "relative",
  display: "grid",
  gridTemplateColumns: "7px minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 12,
  textAlign: "left",
  borderRadius: 18,
  padding: "14px 14px 14px 0",
  marginBottom: 10,
  cursor: "pointer",
  fontWeight: 950,
  overflow: "hidden",
  transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease",
  textShadow: "0 2px 10px rgba(0,0,0,.30)",
  letterSpacing: ".01em",
  backdropFilter: "blur(18px) saturate(155%)",
  WebkitBackdropFilter: "blur(18px) saturate(155%)",
};

const coachDrawerItem = {
  width: "100%",
  position: "relative",
  display: "grid",
  gridTemplateColumns: "7px minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 12,
  textAlign: "left",
  borderRadius: 20,
  padding: "14px 14px 14px 0",
  marginBottom: 10,
  cursor: "pointer",
  fontWeight: 950,
  overflow: "hidden",
  transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease, filter .16s ease",
  transform: "translateZ(0)",
  backdropFilter: "blur(18px) saturate(155%)",
  WebkitBackdropFilter: "blur(18px) saturate(155%)",
};

const successBox = {
  ...liquidGlassPanel,
  border: "1px solid rgba(34,197,94,.34)",
  color: "#bbf7d0",
  fontWeight: 950,
};



const errorBox = {
  ...liquidGlassPanel,
  border: "1px solid rgba(248,113,113,.34)",
  color: "#fecaca",
  fontWeight: 950,
};

const healthGood = {
  ...liquidGlassPanel,
  border: "1px solid rgba(34,197,94,.32)",
  color: "#bbf7d0",
  fontWeight: 950,
};

const healthWarn = {
  ...liquidGlassPanel,
  border: "1px solid rgba(250,204,21,.34)",
  color: "#fef3c7",
  display: "grid",
  gap: 8,
};
  async function startDraftClock(pickNumber = draftSettings27.current_pick, timerMinutes = draftSettings27.timer_minutes || 10) {
    const now = new Date().toISOString();
    const { error: pickError } = await supabase
      .from("cfb27_draft_picks")
      .update({ timer_started_at: now, timer_minutes: Number(timerMinutes) || 10, status: "on_clock" })
      .eq("pick_number", pickNumber);
    const { error: settingsError } = await supabase
      .from("cfb27_draft_settings")
      .upsert({ id: 1, current_pick: pickNumber, timer_minutes: Number(timerMinutes) || 10, is_live: true, updated_at: now }, { onConflict: "id" });
    if (pickError || settingsError) setError(`Draft clock failed: ${(pickError || settingsError).message}`);
    await loadData();
  }

  async function pauseDraftClock() {
    const { error: pauseError } = await supabase
      .from("cfb27_draft_settings")
      .update({ paused: true, updated_at: new Date().toISOString() })
      .eq("id", 1);

    if (pauseError) setError(`Pause clock failed: ${pauseError.message}`);
    setDraftSettings27((prev) => ({ ...prev, paused: true }));
  }

  async function resumeDraftClock() {
    const { error: resumeError } = await supabase
      .from("cfb27_draft_settings")
      .update({ paused: false, updated_at: new Date().toISOString() })
      .eq("id", 1);

    if (resumeError) setError(`Resume clock failed: ${resumeError.message}`);
    setDraftSettings27((prev) => ({ ...prev, paused: false }));
  }


  async function announceDraftPick(pickNumber, teamId) {
    if (!pickNumber || !teamId) {
      setError("Select a team before clicking Pick Is In.");
      return;
    }
    const now = new Date().toISOString();
    const { data: updatedPick, error: pickError } = await supabase
      .from("cfb27_draft_picks")
      .update({ team_id: teamId, picked_at: now, status: "pick_is_in" })
      .eq("pick_number", Number(pickNumber))
      .select()
      .single();

    if (pickError) {
      setError(`Pick Is In failed: ${pickError.message}`);
      return;
    }

    setError(`Pick #${pickNumber} is in. Team is staged and hidden until reveal.`);
    await loadData();
  }

  async function revealDraftPick(pickNumber) {
    const now = new Date().toISOString();
    const nextPick = Number(pickNumber) + 1;

    const { error: revealError } = await supabase
      .from("cfb27_draft_picks")
      .update({ status: "picked" })
      .eq("pick_number", pickNumber);

    const { error: settingsError } = await supabase
      .from("cfb27_draft_settings")
      .upsert({ id: 1, current_pick: nextPick, is_live: true, updated_at: now }, { onConflict: "id" });

    if (revealError || settingsError) {
      setError(`Draft reveal failed: ${(revealError || settingsError).message}`);
      return;
    }

    await supabase
      .from("cfb27_draft_picks")
      .update({ timer_started_at: now, timer_minutes: draftSettings27.timer_minutes || 10, status: "on_clock" })
      .eq("pick_number", nextPick);

    setError("Pick revealed. Next user is now on the clock.");
    await loadData();
  }

  async function undoDraftPick(pickNumber) {
    const { error: undoError } = await supabase
      .from("cfb27_draft_picks")
      .update({ team_id: null, picked_at: null, timer_started_at: null, status: "pending" })
      .eq("pick_number", pickNumber);
    if (undoError) setError(`Draft undo failed: ${undoError.message}`);
    await loadData();
  }




const draftRoomWrap = {
  display: "grid",
  gap: 18,
};

const draftHero = {
  ...liquidGlassPanel,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(260px, 420px)",
  gap: 18,
  alignItems: "stretch",
  background: "radial-gradient(circle at 15% 0%, rgba(250,204,21,.18), transparent 34%), linear-gradient(145deg, rgba(88,28,135,.36), rgba(255,255,255,.055))",
};

const draftHeroTitle = {
  margin: "10px 0",
  color: "#fff",
  fontSize: "clamp(42px, 8vw, 92px)",
  lineHeight: .86,
  letterSpacing: "-.065em",
  fontWeight: 1000,
};

const onClockCard = {
  ...liquidGlassTile,
  display: "grid",
  alignContent: "center",
  gap: 8,
  textAlign: "center",
};

const draftClockPick = {
  color: "#facc15",
  fontSize: "clamp(24px, 5vw, 46px)",
  fontWeight: 1000,
};

const draftClockUser = {
  color: "#fff",
  fontSize: "clamp(20px, 4vw, 34px)",
  fontWeight: 1000,
  overflowWrap: "anywhere",
};

const draftTimer = {
  color: "#fff",
  fontSize: "clamp(38px, 8vw, 76px)",
  fontWeight: 1000,
  letterSpacing: "-.04em",
};

const pickAnnouncementCard = {
  ...liquidGlassPanel,
  background: "linear-gradient(145deg, rgba(250,204,21,.16), rgba(255,255,255,.05))",
};

const pickAnnouncementTitle = {
  margin: "8px 0",
  color: "#fff",
  fontSize: "clamp(24px, 5vw, 48px)",
  fontWeight: 1000,
  letterSpacing: "-.04em",
};

const pickTeamLine = {
  margin: 0,
  color: "#facc15",
  fontSize: "clamp(28px, 7vw, 68px)",
  fontWeight: 1000,
  letterSpacing: "-.06em",
};

const draftBoardGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 12,
};

const draftPickTile = {
  ...liquidGlassTile,
  padding: 14,
  border: "1px solid rgba(255,255,255,.16)",
};

const draftTileUser = {
  color: "#fff",
  fontWeight: 1000,
  fontSize: 18,
  overflowWrap: "anywhere",
};

const draftTileTeam = {
  color: "#facc15",
  fontWeight: 950,
};



const availableTeamTile = {
  border: "1px solid rgba(255,255,255,.16)",
  borderRadius: 16,
  padding: 12,
  display: "grid",
  gap: 4,
  color: "#fff",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.14)",
};



const draftConferenceGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
};

const draftConferenceTile = {
  border: "1px solid rgba(255,255,255,.16)",
  background: "linear-gradient(145deg, rgba(255,255,255,.11), rgba(255,255,255,.035))",
  borderRadius: 16,
  padding: 12,
  display: "grid",
  gap: 4,
  color: "#fff",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.14)",
};



const draftAdminHelp = {
  marginTop: 12,
  color: "rgba(255,255,255,.72)",
  lineHeight: 1.45,
  fontWeight: 750,
};

const pickPreviewCard = {
  marginTop: 14,
  border: "1px solid rgba(250,204,21,.28)",
  background: "linear-gradient(145deg, rgba(250,204,21,.14), rgba(255,255,255,.045))",
  borderRadius: 22,
  padding: 16,
  display: "grid",
  gap: 10,
};


const draftPickHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  color: "rgba(255,255,255,.88)",
  marginBottom: 8,
};

const draftConferenceTileLocked = {
  border: "1px solid rgba(248,113,113,.75)",
  background: "linear-gradient(145deg, rgba(127,29,29,.86), rgba(69,10,10,.68))",
  borderRadius: 16,
  padding: 12,
  display: "grid",
  gap: 4,
  color: "#fff",
  boxShadow: "0 0 0 1px rgba(248,113,113,.22), 0 18px 48px rgba(127,29,29,.34), inset 0 1px 0 rgba(255,255,255,.14)",
};

const availableTeamGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 10,
  alignContent: "start",
  gridAutoRows: "minmax(82px, auto)",
  minHeight: 620,
  overflow: "visible",
};


const draftBroadcastBanner = {
  ...liquidGlassPanel,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 18,
  background: "radial-gradient(circle at 20% 0%, rgba(250,204,21,.22), transparent 34%), linear-gradient(135deg, rgba(49,46,129,.72), rgba(2,6,23,.72))",
  border: "1px solid rgba(250,204,21,.28)",
};

const draftBroadcastTitle = {
  color: "#fff",
  fontSize: "clamp(28px, 6vw, 68px)",
  lineHeight: .9,
  letterSpacing: "-.055em",
  fontWeight: 1000,
  overflowWrap: "anywhere",
};

const draftBroadcastTimer = {
  color: "#facc15",
  fontSize: "clamp(38px, 8vw, 86px)",
  lineHeight: .85,
  letterSpacing: "-.05em",
  fontWeight: 1000,
  textShadow: "0 18px 52px rgba(250,204,21,.20)",
};
