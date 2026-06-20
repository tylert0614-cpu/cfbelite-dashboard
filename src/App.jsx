import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const WEEKS = ["Week 0","Week 1","Week 2","Week 3","Week 4","Week 5","Week 6","Week 7","Week 8","Week 9","Week 10","Week 11","Week 12","Week 13","Week 14","Conference Championship Week","Bowl Week 1","Bowl Week 2","Bowl Week 3","National Championship Week"];
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

function top10Wins(teamId, results) {
  return results.filter((r) => {
    const team1Won = r.team_1_id === teamId && Number(r.team_1_score) > Number(r.team_2_score) && Number(r.team_2_rank) >= 1 && Number(r.team_2_rank) <= 10;
    const team2Won = r.team_2_id === teamId && Number(r.team_2_score) > Number(r.team_1_score) && Number(r.team_1_rank) >= 1 && Number(r.team_1_rank) <= 10;
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


function cleanConference(value) {
  const text = String(value || "Independent").trim();
  const upper = text.toUpperCase();
  if (!text || text === "—") return "Independent";
  if (upper === "PAC-12" || upper === "PAC 12") return "PAC 12";
  if (upper === "CONFERENCE USA" || upper === "C-USA" || upper === "CUSA") return "CUSA";
  if (upper === "MOUNTAIN WEST") return "Mountain West";
  if (upper === "SUN BELT") return "Sun Belt";
  if (upper === "AMERICAN" || upper === "AAC") return "American";
  if (upper === "MAC") return "MAC";
  return text
    .replace(/^conference\s+/i, "")
    .replace(/\s+conference$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getHelmetUrl(team) {
  return team?.logo_url || team?.logo || team?.image_url || "";
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
  const url = team?.logo_url || team?.logo || team?.image_url;
  if (!url) return null;
  return <img src={url} alt="" style={teamWatermark}/>;
}

function ChampionshipRings({ count = 0 }) {
  const safe = Math.min(Number(count) || 0, 12);
  if (!safe) return <span style={mutedText}>No rings yet</span>;
  return <span style={ringRow}>{Array.from({length:safe}, (_,i)=><span key={i} title="National Championship">💍</span>)}</span>;
}


function sortRows(rows, sortState, keyGetters) {
  const key = sortState?.key;
  const direction = sortState?.direction === "asc" ? 1 : -1;
  if (!key || !keyGetters[key]) return rows;
  return [...rows].sort((a,b)=>{
    const av = keyGetters[key](a);
    const bv = keyGetters[key](b);
    const an = Number(av);
    const bn = Number(bv);
    if (!Number.isNaN(an) && !Number.isNaN(bn)) return (an - bn) * direction;
    return String(av ?? "").localeCompare(String(bv ?? "")) * direction;
  });
}

function SortHeader({ label, sortKey, sortState, setSortState }) {
  const active = sortState?.key === sortKey;
  const arrow = !active ? "↕" : sortState.direction === "asc" ? "↑" : "↓";
  return (
    <button type="button" style={sortHeaderButton} onClick={() => setSortState((prev)=>({ key: sortKey, direction: prev?.key === sortKey && prev.direction === "desc" ? "asc" : "desc" }))}>
      {label} {arrow}
    </button>
  );
}

function isUserVsUserResult(result, assignments, year) {
  const y = year || result.season_year;
  const u1 = result.team_1_user_id || coachForTeamYear(result.team_1_id, y, assignments)?.discord_user_id;
  const u2 = result.team_2_user_id || coachForTeamYear(result.team_2_id, y, assignments)?.discord_user_id;
  return Boolean(u1 && u2);
}

function resultUserLabels(result, assignments, users) {
  const u1 = result.team_1_user_id || coachForTeamYear(result.team_1_id, result.season_year, assignments)?.discord_user_id;
  const u2 = result.team_2_user_id || coachForTeamYear(result.team_2_id, result.season_year, assignments)?.discord_user_id;
  return {
    user1: users.find((u)=>u.id===u1)?.discord_username || "CPU",
    user2: users.find((u)=>u.id===u2)?.discord_username || "CPU",
    user1Id: u1 || null,
    user2Id: u2 || null,
    isUserVsUser: Boolean(u1 && u2),
  };
}


function activeAssignmentsForLeague(assignments, teams) {
  const validTeamIds = new Set(teams.map((team)=>team.id));
  const seenUsers = new Set();
  return assignments.filter((assignment)=>{
    if (assignment.status !== "Active") return false;
    if (!assignment.discord_user_id || !assignment.team_id) return false;
    if (!validTeamIds.has(assignment.team_id)) return false;
    if (seenUsers.has(assignment.discord_user_id)) return false;
    seenUsers.add(assignment.discord_user_id);
    return true;
  });
}

function TeamLogoMark({ team, size = 34, faded = false }) {
  const url = team?.logo_url || team?.logo || team?.image_url;
  if (!url) {
    const initials = String(team?.name || "CFB").split(" ").map((part)=>part[0]).join("").slice(0,3).toUpperCase();
    return <span style={{ width:size, height:size, borderRadius:Math.max(8,size*.22), display:"inline-grid", placeItems:"center", background:"rgba(255,255,255,.08)", border:"1px solid rgba(255,255,255,.14)", color:"#fff", fontWeight:1000, fontSize:Math.max(10,size*.28), opacity:faded ? .22 : 1 }}>{initials}</span>;
  }
  return <img src={url} alt="" style={{ width:size, height:size, objectFit:"contain", opacity:faded ? .22 : 1, filter:faded ? "grayscale(.12)" : "none" }}/>;
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
      top10Wins: 0,
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
        top10Wins: 0,
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
      if (team1 && Number(result.team_2_rank) >= 1 && Number(result.team_2_rank) <= 10) team1.top10Wins += 1;
      if (result.week === "Conference Championship Week" && team1) team1.confTitles += 1;
      if (result.week === "National Championship Week" && team1) team1.nattysFromResults += 1;
      if (isBowl) { if (team1) team1.bowlWins += 1; if (team2) team2.bowlLosses += 1; }
    } else if (s2 > s1) {
      if (team2) team2.wins += 1;
      if (team1) team1.losses += 1;
      if (team2 && Number(result.team_1_rank) >= 1 && Number(result.team_1_rank) <= 25) team2.top25Wins += 1;
      if (team2 && Number(result.team_1_rank) >= 1 && Number(result.team_1_rank) <= 10) team2.top10Wins += 1;
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

function recordBookRows(users, teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting, seasonPlayerStats = [], teamSeasonStats = []) {
  const coachRows = getCoachStats(users, teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting);
  const teamRows = teams.map((team) => {
    const rec = recordFromResults(team.id, results);
    return {
      label: team.name,
      wins: rec.wins,
      losses: rec.losses,
      games: rec.games,
      winPct: rec.games ? rec.wins / rec.games : 0,
      avgPf: Number(rec.avgPf),
      avgPa: Number(rec.avgPa),
      top10: top10Wins(team.id, results),
      conf: titleCount(team.id, results, "Conference Championship Week"),
      nattys: titleCount(team.id, results, "National Championship Week"),
      bowlWins: bowlRecord(team.id, results).wins,
      allAmericans: allAmericans.filter((row)=>row.team_id===team.id).length,
      awards: awards.filter((row)=>row.team_id===team.id).length,
      heismans: heismans.filter((row)=>row.team_id===team.id).length,
      top25Classes: recruiting.filter((row)=>row.team_id===team.id && Number(row.rank)>=1 && Number(row.rank)<=25).length,
      bestRecruiting: recruiting.filter((row)=>row.team_id===team.id && Number(row.rank)>0).sort((a,b)=>Number(a.rank)-Number(b.rank))[0]?.rank || null,
      sor: Number(strengthOfResult(team.id, teams, results)) || 0,
    };
  });

  const seasonRows = [];
  teams.forEach((team) => {
    [...new Set(results.map((row)=>row.season_year).filter(Boolean))].forEach((year) => {
      const rec = recordFromResults(team.id, results, year);
      seasonRows.push({
        label: `${team.name} (${year})`,
        wins: rec.wins,
        losses: rec.losses,
        winPct: rec.games ? rec.wins / rec.games : 0,
        top10: top10Wins(team.id, results.filter((row)=>String(row.season_year)===String(year))),
        avgPf: Number(rec.avgPf),
      });
    });
  });

  const tiedBest = (rows, key, label, formatter = (value) => value, minValue = 1) => {
    const validRows = rows.filter((row)=>Number(row[key] || 0) >= minValue);
    if (!validRows.length) return { record: label, holders: ["—"], value: "—" };
    const bestValue = Math.max(...validRows.map((row)=>Number(row[key] || 0)));
    const tiedRows = validRows
      .filter((row)=>Number(row[key] || 0) === bestValue)
      .sort((a,b)=>String(a.discord || a.label).localeCompare(String(b.discord || b.label)));
    return {
      record: label,
      holders: tiedRows.map((row)=>row.discord || row.label || "—"),
      value: formatter(bestValue, tiedRows[0]),
    };
  };

  return [
    tiedBest(coachRows, "wins", "Most Career Wins"),
    tiedBest(coachRows, "nattys", "Most National Championships"),
    tiedBest(coachRows, "confTitles", "Most Conference Championships"),
    tiedBest(coachRows, "top10Wins", "Most Top 10 Wins"),
    tiedBest(coachRows, "bowlWins", "Most Bowl Wins"),
    tiedBest(coachRows, "heismans", "Most Heisman Winners"),
    tiedBest(coachRows, "awards", "Most Awards"),
    tiedBest(coachRows, "allAmericans", "Most All-Americans"),
    tiedBest(coachRows, "top25Classes", "Most Top 25 Recruiting Classes"),
    tiedBest(coachRows, "winPct", "Highest Career Win %", (value)=>`${(value*100).toFixed(1)}%`, 0.001),

    tiedBest(teamRows, "wins", "Program: Most Wins"),
    tiedBest(teamRows, "nattys", "Program: Most National Championships"),
    tiedBest(teamRows, "conf", "Program: Most Conference Championships"),
    tiedBest(teamRows, "top10", "Program: Most Top 10 Wins"),
    tiedBest(teamRows, "bowlWins", "Program: Most Bowl Wins"),
    tiedBest(teamRows, "heismans", "Program: Most Heismans"),
    tiedBest(teamRows, "awards", "Program: Most Awards"),
    tiedBest(teamRows, "allAmericans", "Program: Most All-Americans"),
    tiedBest(teamRows, "top25Classes", "Program: Most Top 25 Recruiting Classes"),
    tiedBest(teamRows, "winPct", "Program: Highest Win %", (value)=>`${(value*100).toFixed(1)}%`, 0.001),
    tiedBest(teamRows.filter((row)=>row.bestRecruiting), "bestRecruiting", "Program: Best Recruiting Class Rank", (value)=>`#${value}`, 1),

    tiedBest(seasonRows, "wins", "Single Season: Most Wins"),
    tiedBest(seasonRows, "top10", "Single Season: Most Top 10 Wins"),
    tiedBest(seasonRows, "avgPf", "Single Season: Highest Avg PF", (value)=>Number(value).toFixed(1), 0.001),

    tiedBest(teamSeasonStats.map((row)=>({label: `${teamNameById(row.team_id, teams)} (${row.season_year})`, total_offense: row.total_offense || 0})), "total_offense", "Team Stats: Most Total Offense", (value)=>Number(value).toLocaleString(), 1),
    tiedBest(teamSeasonStats.map((row)=>({label: `${teamNameById(row.team_id, teams)} (${row.season_year})`, points_per_game: row.points_per_game || 0})), "points_per_game", "Team Stats: Highest PPG", (value)=>Number(value).toFixed(1), 0.1),
    tiedBest(teamSeasonStats.map((row)=>({label: `${teamNameById(row.team_id, teams)} (${row.season_year})`, total_ppg_allowed: row.total_ppg_allowed ? 1000-Number(row.total_ppg_allowed) : 0, actual: row.total_ppg_allowed})), "total_ppg_allowed", "Team Stats: Best Total PPG Allowed", (value,row)=>Number(row.actual).toFixed(1), 1),
    tiedBest(teamSeasonStats.map((row)=>({label: `${teamNameById(row.team_id, teams)} (${row.season_year})`, turnover_margin: row.turnover_margin || 0})), "turnover_margin", "Team Stats: Best Turnover Margin", (value)=>`+${value}`, 1),
    tiedBest(seasonPlayerStats.map((row)=>({label: `${row.player_name} (${row.season_year})`, pass_yards: row.pass_yards || 0})), "pass_yards", "Player Stats: Most Pass Yards", (value)=>Number(value).toLocaleString(), 1),
    tiedBest(seasonPlayerStats.map((row)=>({label: `${row.player_name} (${row.season_year})`, rush_yards: row.rush_yards || 0})), "rush_yards", "Player Stats: Most Rush Yards", (value)=>Number(value).toLocaleString(), 1),
    tiedBest(seasonPlayerStats.map((row)=>({label: `${row.player_name} (${row.season_year})`, rec_yards: row.rec_yards || 0})), "rec_yards", "Player Stats: Most Receiving Yards", (value)=>Number(value).toLocaleString(), 1),

    // Records 2.0: Team Offense / Defense / Turnovers
    tiedBest(teamSeasonStats.map((row)=>({label: `${teamNameById(row.team_id, teams)} (${row.season_year})`, value: row.points_per_game || 0})), "value", "Team Record: Highest PPG", (value)=>Number(value).toFixed(1), 0.1),
    tiedBest(teamSeasonStats.map((row)=>({label: `${teamNameById(row.team_id, teams)} (${row.season_year})`, value: row.total_offense || 0})), "value", "Team Record: Most Total Offense", (value)=>Number(value).toLocaleString(), 1),
    tiedBest(teamSeasonStats.map((row)=>({label: `${teamNameById(row.team_id, teams)} (${row.season_year})`, value: row.takeaways || 0})), "value", "Team Record: Most Takeaways", (value)=>Number(value).toLocaleString(), 1),
    tiedBest(teamSeasonStats.map((row)=>({label: `${teamNameById(row.team_id, teams)} (${row.season_year})`, value: row.turnover_margin || 0})), "value", "Team Record: Best Turnover Margin", (value)=>Number(value) >= 0 ? `+${value}` : value, 1),
    tiedBest(teamSeasonStats.map((row)=>({label: `${teamNameById(row.team_id, teams)} (${row.season_year})`, value: row.sacks || 0})), "value", "Team Record: Most Sacks", (value)=>Number(value).toLocaleString(), 1),
    tiedBest(teamSeasonStats.map((row)=>({label: `${teamNameById(row.team_id, teams)} (${row.season_year})`, value: row.tfls || 0})), "value", "Team Record: Most TFLs", (value)=>Number(value).toLocaleString(), 1),
    tiedBest(teamSeasonStats.map((row)=>({label: `${teamNameById(row.team_id, teams)} (${row.season_year})`, value: row.total_ppg_allowed ? 1000 - Number(row.total_ppg_allowed) : 0, actual: row.total_ppg_allowed})), "value", "Team Record: Lowest PPG Allowed", (value,row)=>row.actual ? Number(row.actual).toFixed(1) : "—", 1),

    // Records 2.0: Player Offense / Defense
    tiedBest(seasonPlayerStats.map((row)=>({label: `${row.player_name} (${row.season_year})`, value: row.pass_yards || 0})), "value", "Player Record: Passing Yards", (value)=>Number(value).toLocaleString(), 1),
    tiedBest(seasonPlayerStats.map((row)=>({label: `${row.player_name} (${row.season_year})`, value: row.pass_tds || 0})), "value", "Player Record: Passing TDs", (value)=>Number(value).toLocaleString(), 1),
    tiedBest(seasonPlayerStats.map((row)=>({label: `${row.player_name} (${row.season_year})`, value: row.rush_yards || 0})), "value", "Player Record: Rushing Yards", (value)=>Number(value).toLocaleString(), 1),
    tiedBest(seasonPlayerStats.map((row)=>({label: `${row.player_name} (${row.season_year})`, value: row.rush_tds || 0})), "value", "Player Record: Rushing TDs", (value)=>Number(value).toLocaleString(), 1),
    tiedBest(seasonPlayerStats.map((row)=>({label: `${row.player_name} (${row.season_year})`, value: row.rec_yards || 0})), "value", "Player Record: Receiving Yards", (value)=>Number(value).toLocaleString(), 1),
    tiedBest(seasonPlayerStats.map((row)=>({label: `${row.player_name} (${row.season_year})`, value: row.rec_tds || 0})), "value", "Player Record: Receiving TDs", (value)=>Number(value).toLocaleString(), 1),
    tiedBest(seasonPlayerStats.map((row)=>({label: `${row.player_name} (${row.season_year})`, value: row.tackles || 0})), "value", "Player Record: Tackles", (value)=>Number(value).toLocaleString(), 1),
    tiedBest(seasonPlayerStats.map((row)=>({label: `${row.player_name} (${row.season_year})`, value: row.sacks || 0})), "value", "Player Record: Sacks", (value)=>Number(value).toLocaleString(), 1),
    tiedBest(seasonPlayerStats.map((row)=>({label: `${row.player_name} (${row.season_year})`, value: row.interceptions_def || 0})), "value", "Player Record: Interceptions", (value)=>Number(value).toLocaleString(), 1),
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
  const [seasonPlayerStats, setSeasonPlayerStats] = useState([]);
  const [teamSeasonStats, setTeamSeasonStats] = useState([]);
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
  const coachProfileUsers = useMemo(() => {
    return userOptions.filter((user) => user?.id && user?.discord_username);
  }, [userOptions]);
  const selectedCoach = activeTab.startsWith("coach-") ? (coachProfileUsers.find((user) => `coach-${user.id}` === activeTab) || users.find((user) => `coach-${user.id}` === activeTab) || null) : null;
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

  const baseTabs = [["dashboard","Dashboard"],["draftRoom","CFBElite 27 Draft Room"],["commissionerCenter","Commissioner Center"],["logoManager","Team Assets"],["leagueDataCenter","League Data Center"],["seasonStats","Season Player Stats"],["teamStats","Team Stats"],["recruitingRankings","Recruiting Rankings"],["dynastyTimeline","Dynasty Timeline"],["dynastyRecords","League Records"],["dynastyHOF","Dynasty Hall of Fame"],["rivalries","Rivalries"],["powerIndex","Power Index"],["eloRankings","User ELO"],["conferencePower","Conference Power"],["coachHOF","Coach Hall of Fame"],["playerHOF","Player Hall of Fame"],["assignments","Users/Team Assignments"],["resultsManager","Results Manager"],["h2h","User vs User H2H"],["allAmericans","All-Americans"],["awards","Awards"],["heismans","Heisman Winners"],["nationalChampions","National Champions"],...coachProfileUsers.map((user) => [`coach-${user.id}`, user.discord_username])];
  const tabs = useMemo(() => {
    const tabMap = new Map(baseTabs);
    const ordered = tabOrder
      .map((key) => tabMap.has(key) ? [key, tabMap.get(key)] : null)
      .filter(Boolean);
    const remaining = baseTabs.filter(([key]) => !tabOrder.includes(key));
    return [...ordered, ...remaining];
  }, [tabOrder, coachProfileUsers]);

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
    const [teamsRes, settingsRes, tabOrderRes, usersRes, assignmentsRes, standingsRes, rankingsRes, resultsRes, weeklyMatchupsRes, draftPicks27Res, draftSettings27Res, aaRes, awardsRes, heismanRes, championsRes, draftRes, playoffRes, recruitingRes, seasonStatsRes, teamStatsRes, historyRes] = await Promise.all([
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
      supabase.from("season_player_stats").select("*, teams(name), discord_users(discord_username)").order("season_year", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("team_season_stats").select("*, teams(name), discord_users(discord_username)").order("season_year", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("team_history_records").select("*, teams(name)").order("season_year", { ascending: false }),
    ]);
    const firstError = [teamsRes, settingsRes, tabOrderRes, usersRes, assignmentsRes, standingsRes, rankingsRes, resultsRes, weeklyMatchupsRes, draftPicks27Res, draftSettings27Res, aaRes, awardsRes, heismanRes, championsRes, draftRes, playoffRes, recruitingRes, seasonStatsRes, teamStatsRes, historyRes].find((r) => r.error)?.error;
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
      setSeasonPlayerStats(seasonStatsRes.data || []);
      setTeamSeasonStats(teamStatsRes.data || []);
      setHistoryRows(historyRes.data || []);
    }
    setLoading(false);
  }
  useEffect(() => { loadData(); }, []);

  async function submitResult() {
    const team1Score = scoreNumber(newResult.team_1_score); const team2Score = scoreNumber(newResult.team_2_score);
    if (!newResult.team_1_id || !newResult.team_2_id || team1Score === null || team2Score === null) { setError("Please select both teams and enter both scores."); return; }
    const team1AssignedUser = newResult.team_1_user_id || coachForTeamYear(newResult.team_1_id, newResult.season_year, assignments)?.discord_user_id || null;
    const team2AssignedUser = newResult.team_2_user_id || coachForTeamYear(newResult.team_2_id, newResult.season_year, assignments)?.discord_user_id || null;
    const baseTags = newResult.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
    const cpuAwareTags = [...baseTags, team1AssignedUser && team2AssignedUser ? "User vs User" : "CPU Game"];
    const { error: insertError } = await supabase.from("game_results").insert({ season_year: Number(newResult.season_year), week: newResult.week, team_1_id: newResult.team_1_id, team_2_id: newResult.team_2_id, team_1_user_id: team1AssignedUser, team_2_user_id: team2AssignedUser, team_1_score: team1Score, team_2_score: team2Score, team_1_rank: newResult.team_1_rank ? Number(newResult.team_1_rank) : null, team_2_rank: newResult.team_2_rank ? Number(newResult.team_2_rank) : null, tags: [...new Set(cpuAwareTags)] });
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
      .select("id, name, logo_url, primary_color, secondary_color")
      .eq("id", team.id)
      .limit(1);

    if (verifyError) {
      setError(`Team asset save verification failed: ${verifyError.message}`);
      return;
    }

    const savedRow = verifyRows?.[0];
    const primarySaved = (savedRow?.primary_color || null) === payload.primary_color;
    const secondarySaved = (savedRow?.secondary_color || null) === payload.secondary_color;
    const logoSaved = (savedRow?.logo_url || null) === payload.logo_url;

    if (!savedRow || !primarySaved || !secondarySaved || !logoSaved) {
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

  return <><GlobalStyle/><div style={page}><div style={container}><Header loading={loading} reload={loadData}/>{error && <div style={isErrorMessage(error) ? errorBox : successBox}>{error}</div>}<TabBar tabs={tabs} activeTab={activeTab} setActiveTab={setActiveTab} draggedTab={draggedTab} setDraggedTab={setDraggedTab} reorderTabs={reorderTabs} adminUnlocked={adminUnlocked} adminCodeInput={adminCodeInput} setAdminCodeInput={setAdminCodeInput} unlockAdmin={unlockAdmin} teams={teamOptions} assignments={assignments} currentYear={currentYear}/>
    {activeTab === "draftRoom" && <DraftRoom teams={teamOptions} users={userOptions} picks={draftPicks27} settings={draftSettings27} startClock={startDraftClock} pauseClock={pauseDraftClock} resumeClock={resumeDraftClock} announcePick={announceDraftPick} revealPick={revealDraftPick} undoPick={undoDraftPick}/>}     
    {activeTab === "dashboard" && <DashboardRedesign teams={activeTeamOptions} users={userOptions} assignments={assignments} results={currentYearResults} allResults={results} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting} teamSeasonStats={teamSeasonStats} currentYear={currentYear} currentWeek={currentWeek} setCurrentYear={(value)=>{setCurrentYear(value); setNewResult((prev)=>({...prev, season_year: Number(value)}));}} setCurrentWeek={(value)=>{setCurrentWeek(value); setNewResult((prev)=>({...prev, week: value}));}} saveSettings={saveLeagueSettings} goToTeam={goToTeam} sortState={userSort} setSortState={setUserSort}/>}
    {activeTab === "eloRankings" && <EloRankings users={userOptions} teams={teamOptions} assignments={assignments} results={results}/>}    
    {activeTab === "dynastyRecords" && <DynastyRecords users={userOptions} teams={teamOptions} assignments={assignments} results={results} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting} seasonPlayerStats={seasonPlayerStats} teamSeasonStats={teamSeasonStats}/>}    
    {activeTab === "dynastyHOF" && <DynastyHallOfFame users={userOptions} teams={teamOptions} assignments={assignments} results={results} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting}/>}    
    {activeTab === "rivalries" && <Rivalries users={userOptions} teams={teamOptions} assignments={assignments} results={results}/>}    
    {activeTab === "powerIndex" && <DynastyPowerIndex users={userOptions} teams={teamOptions} assignments={assignments} results={results} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting}/>}
    {activeTab === "commissionerCenter" && (adminUnlocked ? <CommissionerCenterSafe setActiveTab={setActiveTab} loadData={loadData}/> : <AdminLocked adminCodeInput={adminCodeInput} setAdminCodeInput={setAdminCodeInput} unlockAdmin={unlockAdmin}/>) }    
    {activeTab === "logoManager" && <LogoManager teams={teamOptions} updateRow={updateRow}/>}    
    {activeTab === "leagueDataCenter" && <LeagueDataCenter teams={teamOptions} users={userOptions} assignments={assignments} results={results} currentYear={currentYear} currentWeek={currentWeek} setError={setError} loadData={loadData}/>}
    {activeTab === "conferencePower" && <ConferencePowerRankings teams={activeTeamOptions} users={userOptions} assignments={assignments} results={currentYearResults} allResults={results} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting}/>}    
    {activeTab === "weeklyMedia" && <WeeklyMedia teams={activeTeamOptions} users={userOptions} assignments={assignments} results={currentYearResults} allResults={results} weeklyMatchups={weeklyMatchups} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting} currentYear={currentYear} currentWeek={currentWeek}/>}    
    {activeTab === "weeklyMatchups" && (adminUnlocked ? <WeeklyMatchups rows={weeklyMatchups} newMatchup={newWeeklyMatchup} setNewMatchup={setNewWeeklyMatchup} teams={activeTeamOptions} users={userOptions} assignments={assignments} results={currentYearResults} currentYear={currentYear} currentWeek={currentWeek} addMatchup={addWeeklyMatchup} deleteRow={deleteRow} matchupImportText={matchupImportText} setMatchupImportText={setMatchupImportText} importWeeklyMatchups={importWeeklyMatchups}/> : <AdminLocked adminCodeInput={adminCodeInput} setAdminCodeInput={setAdminCodeInput} unlockAdmin={unlockAdmin}/>) }    
    {activeTab === "seasonStats" && <SeasonStatsPage rows={seasonPlayerStats} teams={teamOptions} users={userOptions} updateRow={updateRow} deleteRow={deleteRow}/>}    
    {activeTab === "teamStats" && <TeamStatsPage rows={teamSeasonStats} teams={teamOptions} users={userOptions} deleteRow={deleteRow}/>}    
    {activeTab === "recruitingRankings" && <RecruitingRankings rows={recruiting} teams={teamOptions} users={userOptions} assignments={assignments} currentYear={currentYear} loadData={loadData} deleteRow={deleteRow} updateRow={updateRow}/>}    
    {activeTab === "dynastyTimeline" && <DynastyTimeline results={results} teams={teamOptions} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting}/>}
    {activeTab === "coachHOF" && <CoachHallOfFame users={userOptions} teams={teamOptions} assignments={assignments} results={results} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting}/>}    
    {activeTab === "playerHOF" && <PlayerHallOfFame teams={teamOptions} assignments={assignments} results={results} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions}/>}    
    {activeTab === "assignments" && (adminUnlocked ? <Assignments rows={assignments} teams={teamOptions} users={userOptions} currentYear={currentYear} addAssignment={addAssignment} updateRow={updateRow} deleteRow={deleteRow} drafts={draftAssignments} setDrafts={setDraftAssignments} saveDraft={saveDraft} getDraft={getDraft} teamChange={teamChange} setTeamChange={setTeamChange} changeUserTeam={changeUserTeam}/> : <AdminLocked adminCodeInput={adminCodeInput} setAdminCodeInput={setAdminCodeInput} unlockAdmin={unlockAdmin}/>) }    
    {activeTab === "resultsManager" && <ResultsManager rows={results} teams={teamOptions} users={userOptions} assignments={assignments} updateRow={updateRow} deleteRow={deleteRow}/>}    
    {activeTab === "h2h" && <H2H results={results} search={search.h2h} setSearch={(v)=>setSearch({...search,h2h:v})}/>}    
    {activeTab === "allAmericans" && <AllAmericans rows={allAmericans} teams={teamOptions} addRow={addAA} updateRow={updateRow} deleteRow={deleteRow} rankings={[]} drafts={draftAllAmericans} setDrafts={setDraftAllAmericans} saveDraft={saveDraft} getDraft={getDraft}/>}    
    {activeTab === "awards" && <Awards rows={awards} teams={teamOptions} addRow={addAward} updateRow={updateRow} deleteRow={deleteRow} rankings={[]} drafts={draftAwards} setDrafts={setDraftAwards} saveDraft={saveDraft} getDraft={getDraft}/>}    
    {activeTab === "heismans" && <Heismans rows={heismans} teams={teamOptions} addRow={addHeisman} updateRow={updateRow} deleteRow={deleteRow} drafts={draftHeismans} setDrafts={setDraftHeismans} saveDraft={saveDraft} getDraft={getDraft}/>}    
    {activeTab === "nationalChampions" && <NationalChampions rows={nationalChampions} teams={teamOptions} users={userOptions} addRow={addNationalChampion} updateRow={updateRow} deleteRow={deleteRow} drafts={draftChampions} setDrafts={setDraftChampions} saveDraft={saveDraft} getDraft={getDraft}/>}        
    {selectedTeam && <TeamPage team={selectedTeam} standings={standings.find((row)=>row.team_id===selectedTeam.id)} results={currentYearResults} allResults={results} teams={teamOptions} assignments={assignments} allAmericans={allAmericans} awards={awards} heismans={heismans} recruiting={recruiting} historyRows={historyRows} addRecruiting={addRecruiting} addHistory={addHistory} updateRow={updateRow} deleteRow={deleteRow} newRecruiting={newRecruiting} setNewRecruiting={setNewRecruiting} newHistory={newHistory} setNewHistory={setNewHistory}/>}    
    {selectedCoach && <CoachProfile user={selectedCoach} users={userOptions} teams={teamOptions} assignments={assignments} results={results} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting} seasonPlayerStats={seasonPlayerStats} teamSeasonStats={teamSeasonStats}/>}    
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
  if (!game) return <section style={card}><h2 style={sectionTitle}>🔥 Draft Room</h2><p style={mutedText}>No weekly matchups entered for {currentYear} {currentWeek} yet.</p></section>;
  return <section style={card}><h2 style={sectionTitle}>🔥 Draft Room</h2><div style={gotwCard}><div style={gotwTeam}><TeamLabel team={game.team_1 || teams.find((t)=>t.id===game.team_1_id)}/><span>{game.user_1?.discord_username || matchupUserLabel(game.team_1_user_id, users)}</span></div><div style={gotwScore}>{game.game.score}</div><div style={gotwTeam}><TeamLabel team={game.team_2 || teams.find((t)=>t.id===game.team_2_id)}/><span>{game.user_2?.discord_username || matchupUserLabel(game.team_2_user_id, users)}</span></div></div><p style={mutedText}>Why: {game.game.reasons.join(" • ")}</p></section>;
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

function DynastyRecords({ users, teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting, seasonPlayerStats = [], teamSeasonStats = [] }) {
  const records = recordBookRows(users, teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting, seasonPlayerStats || [], teamSeasonStats || []);

  return (
    <section style={card}>
      <h2 style={sectionTitle}>CFBElite Dynasty Records</h2>
      <p style={mutedText}>Ties are shown together. Top 10 wins are used instead of Top 10 wins to keep elite wins meaningful in a 32-user league.</p>
      <div style={recordGrid}>
        {records.map((row)=>(
          <div key={row.record} style={recordCard}>
            <div style={statTitle}>{row.record}</div>
            <div style={recordValue}>{row.value ?? "—"}</div>
            <div style={recordHolders}>
              {(row.holders || [row.holder || "—"]).map((holder)=>(
                <span key={`${row.record}-${holder}`} style={recordHolderPill}>{holder}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}


function dynastyPrestigeTier(score) {
  const n = Number(score) || 0;
  if (n >= 95) return { stars: "⭐⭐⭐⭐⭐", label: "Blue Blood", tier: "Blue Blood" };
  if (n >= 85) return { stars: "⭐⭐⭐⭐⭐", label: "National Power", tier: "National Power" };
  if (n >= 75) return { stars: "⭐⭐⭐⭐", label: "Contender", tier: "Contender" };
  if (n >= 65) return { stars: "⭐⭐⭐", label: "Rising Program", tier: "Rising Program" };
  if (n >= 50) return { stars: "⭐⭐⭐", label: "Established", tier: "Established" };
  if (n >= 35) return { stars: "⭐⭐", label: "Rebuilding", tier: "Rebuilding" };
  return { stars: "⭐", label: "Basement", tier: "Basement" };
}

function dynastyPrestigeRows(teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting, teamSeasonStats = []) {
  const hofPlayersByTeam = new Map();
  if (typeof playerHallRows === "function") {
    try {
      playerHallRows(teams, assignments, results, allAmericans, awards, heismans, nationalChampions).forEach((row)=>{
        hofPlayersByTeam.set(row.teamId, (hofPlayersByTeam.get(row.teamId) || 0) + 1);
      });
    } catch (e) {}
  }

  const rawRows = teams.map((team)=>{
    const rec = recordFromResults(team.id, results);
    const games = rec.wins + rec.losses;
    const winPct = games ? rec.wins / games : 0;
    const nattys = nationalChampions.filter((row)=>row.team_id===team.id).length + titleCount(team.id, results, "National Championship Week");
    const confTitles = titleCount(team.id, results, "Conference Championship Week");
    const bowl = bowlRecord(team.id, results);
    const top10 = top10Wins(team.id, results);
    const aa = allAmericans.filter((row)=>row.team_id===team.id).length;
    const awardCount = awards.filter((row)=>row.team_id===team.id).length;
    const heismanCount = heismans.filter((row)=>row.team_id===team.id).length;
    const recruitingRows = recruiting.filter((row)=>row.team_id===team.id && Number(row.rank)>0);
    const avgRecruitRank = recruitingRows.length ? recruitingRows.reduce((sum,row)=>sum+Number(row.rank),0)/recruitingRows.length : null;
    const bestRecruitRank = recruitingRows.length ? Math.min(...recruitingRows.map((row)=>Number(row.rank))) : null;
    const top25Classes = recruitingRows.filter((row)=>Number(row.rank)<=25).length;
    const teamStats = teamSeasonStats.filter((row)=>row.team_id===team.id);
    const manualTop10 = teamStats.reduce((sum,row)=>sum+Number(row.top10_wins || 0),0);
    const manualConf = teamStats.reduce((sum,row)=>sum+Number(row.conference_titles || 0),0);
    const manualNatty = teamStats.reduce((sum,row)=>sum+Number(row.national_titles || 0),0);
    const hofPlayers = hofPlayersByTeam.get(team.id) || 0;

    const titleScore = (nattys + manualNatty) * 26 + (confTitles + manualConf) * 10;
    const winningScore = winPct * 22 + Math.min(rec.wins * .8, 30) + bowl.wins * 2;
    const eliteWinScore = (top10 + manualTop10) * 4.5;
    const talentScore = heismanCount * 7 + awardCount * 2.5 + aa * 1.25 + hofPlayers * 7;
    const recruitingScore = avgRecruitRank ? Math.max(0, 28 - avgRecruitRank * .72) + top25Classes * 1.6 + (bestRecruitRank === 1 ? 8 : bestRecruitRank && bestRecruitRank <= 5 ? 4 : 0) : 0;
    const longevityScore = Math.min(games * .45, 14);

    const rawScore = titleScore + winningScore + eliteWinScore + talentScore + recruitingScore + longevityScore;
    return { team, rec, games, winPct, nattys: nattys + manualNatty, confTitles: confTitles + manualConf, top10: top10 + manualTop10, bowl, aa, awardCount, heismanCount, avgRecruitRank, bestRecruitRank, top25Classes, hofPlayers, rawScore };
  });

  const maxRaw = Math.max(1, ...rawRows.map((row)=>row.rawScore));
  return rawRows.map((row)=>{
    const score = Number(Math.min(100, (row.rawScore / maxRaw) * 100).toFixed(1));
    return { ...row, score, tier: dynastyPrestigeTier(score) };
  }).sort((a,b)=>b.score-a.score || b.nattys-a.nattys || b.rec.wins-a.rec.wins || a.team.name.localeCompare(b.team.name));
}

function PrestigeHistory({ teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting, teamSeasonStats }) {
  const years = [...new Set([
    ...results.map((r)=>r.season_year),
    ...recruiting.map((r)=>r.season_year),
    ...teamSeasonStats.map((r)=>r.season_year),
  ].filter(Boolean).map(Number))].sort((a,b)=>a-b);

  const currentRows = dynastyPrestigeRows(teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting, teamSeasonStats);
  const topRows = currentRows.slice(0,12);

  function scoreForYear(teamId, year) {
    const rows = dynastyPrestigeRows(
      teams.filter((t)=>t.id===teamId),
      assignments,
      results.filter((r)=>Number(r.season_year)<=year),
      allAmericans.filter((r)=>Number(r.season_year)<=year),
      awards.filter((r)=>Number(r.season_year)<=year),
      heismans.filter((r)=>Number(r.season_year)<=year),
      nationalChampions.filter((r)=>Number(r.season_year)<=year),
      recruiting.filter((r)=>Number(r.season_year)<=year),
      teamSeasonStats.filter((r)=>Number(r.season_year)<=year)
    );
    return rows[0]?.score || 0;
  }

  return (
    <section style={broadcastPageCard}>
      <h2 style={sectionTitle}>Prestige History</h2>
      <p style={mutedText}>Blue Blood score, movement, trendline bars, and historical prestige ranking by season.</p>
      <div style={prestigeHistoryGrid}>
        {topRows.map((row)=>{
          const trend = years.slice(-6).map((year)=>({ year, score: scoreForYear(row.team.id, year) }));
          const last = trend[trend.length-1]?.score || row.score;
          const prev = trend[trend.length-2]?.score || Math.max(0,last-1);
          const delta = last - prev;
          return (
            <div key={row.team.id} style={prestigeHistoryCard}>
              <div style={leaderRow}><b><TeamLabel team={row.team}/></b><span>{delta >= 0 ? "⬆️" : "⬇️"} {delta >= 0 ? "+" : ""}{delta.toFixed(1)}</span></div>
              <div style={prestigeScore}>{row.score}</div>
              <div style={prestigeTierPill}>{row.tier.stars} {row.tier.label}</div>
              <div style={trendBars}>
                {trend.map((item)=><div key={item.year} title={`${item.year}: ${item.score}`} style={{...trendBar, height: `${Math.max(8,item.score)}%`}} />)}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ProgramPrestige({ teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting, teamSeasonStats = [] }) {
  const rows = dynastyPrestigeRows(teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting, teamSeasonStats);

  return (
    <section style={broadcastCard}>
      <h2 style={sectionTitle}>Dynasty Prestige Engine</h2>
      <p style={mutedText}>Prestige uses titles, win percentage, Top 10 wins, recruiting average/peaks, Heismans, All-Americans, awards, bowl success, Hall of Fame players, and manually-entered team season stats.</p>
      <div style={prestigeGrid}>
        {rows.map((row, index)=>(
          <div key={row.team.id} style={prestigeCard}>
            <div style={leaderRow}>
              <b>#{index + 1}</b>
              <span style={prestigeTierPill}>{row.tier.stars} {row.tier.label}</span>
            </div>
            <div style={prestigeTeamName}><TeamLabel team={row.team}/></div>
            <div style={prestigeScore}>{row.score}</div><div style={positiveTrend}>+{Math.max(0.1, (row.score/22)).toFixed(1)} from last season</div>
            <div style={prestigeMiniGrid}>
              <span>Record <b>{row.rec.wins}-{row.rec.losses}</b></span>
              <span>Win % <b>{(row.winPct*100).toFixed(1)}%</b></span>
              <span>Nattys <b>{row.nattys}</b></span>
              <span>Conf <b>{row.confTitles}</b></span>
              <span>Top 10 <b>{row.top10}</b></span>
              <span>Avg Recruit <b>{row.avgRecruitRank ? `#${row.avgRecruitRank.toFixed(1)}` : "—"}</b></span>
              <span>Best Recruit <b>{row.bestRecruitRank ? `#${row.bestRecruitRank}` : "—"}</b></span>
              <span>AA/Awards <b>{row.aa}/{row.awardCount}</b></span>
              <span>Heisman <b>{row.heismanCount}</b></span>
              <span>HOF Players <b>{row.hofPlayers}</b></span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
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



function dynastyWireItems({ rankingDetails = [], results = [], teams = [], recruiting = [], prestigeRows = [], currentYear }) {
  const items = [];
  const currentResults = (results || []).filter((row)=>String(row.season_year) === String(currentYear));
  currentResults.slice(-12).reverse().forEach((result)=>{
    const t1 = teams.find((team)=>team.id===result.team_1_id) || result.team_1 || result.teams_1;
    const t2 = teams.find((team)=>team.id===result.team_2_id) || result.team_2 || result.teams_2;
    const s1 = Number(result.team_1_score);
    const s2 = Number(result.team_2_score);
    if (!t1 || !t2 || Number.isNaN(s1) || Number.isNaN(s2)) return;
    const r1 = Number(result.team_1_rank || rankingDetails.find((row)=>row.team?.id===t1.id)?.rank || 0);
    const r2 = Number(result.team_2_rank || rankingDetails.find((row)=>row.team?.id===t2.id)?.rank || 0);
    const winner = s1 > s2 ? t1 : t2;
    const loser = s1 > s2 ? t2 : t1;
    const winnerRank = s1 > s2 ? r1 : r2;
    const loserRank = s1 > s2 ? r2 : r1;
    if (loserRank && (!winnerRank || winnerRank > loserRank + 5)) {
      items.push({ title: `Upset Alert: ${winner.name} defeats #${loserRank} ${loser.name}`, meta: "Largest upset watch", icon: "🚨" });
    } else if (loserRank && loserRank <= 10) {
      items.push({ title: `Resume Builder: ${winner.name} adds a Top 10 win`, meta: "CFP résumé boost", icon: "📈" });
    } else {
      items.push({ title: `${winner.name} takes down ${loser.name} ${Math.max(s1,s2)}-${Math.min(s1,s2)}`, meta: "Final score", icon: "🏈" });
    }
  });

  const topClass = (recruiting || [])
    .filter((row)=>String(row.season_year) === String(currentYear) && Number(row.rank) > 0)
    .sort((a,b)=>Number(a.rank)-Number(b.rank))[0];
  if (topClass) {
    items.push({ title: `Recruiting Win: ${teamNameById(topClass.team_id, teams)} lands the #${topClass.rank} class`, meta: "Signing day watch", icon: "📝" });
  }

  if (rankingDetails[0]) {
    items.push({ title: `${rankingDetails[0].teamName} holds #1 in the CFBElite Automatic Rankings`, meta: "CFP committee desk", icon: "🏆" });
  }

  if (prestigeRows[0]) {
    const tier = dynastyPrestigeTier(prestigeRows[0].score);
    items.push({ title: `${prestigeRows[0].team.name} is a ${tier.label} program`, meta: `Prestige ${prestigeRows[0].score}`, icon: "⭐" });
  }

  return items.slice(0,8);
}

function coachMilestonesForStats(stats = {}) {
  const rows = [];
  const wins = Number(stats.wins || 0);
  const top10 = Number(stats.top10Wins || 0);
  const nattys = Number(stats.nattys || 0);
  const confTitles = Number(stats.confTitles || 0);
  const awards = Number(stats.awards || 0);
  if (wins >= 50) rows.push({ label: "50 Career Wins", icon: "🏁" });
  if (wins >= 100) rows.push({ label: "100 Career Wins", icon: "💯" });
  if (wins >= 200) rows.push({ label: "200 Career Wins", icon: "👑" });
  if (top10 >= 10) rows.push({ label: "10 Top 10 Wins", icon: "⚡" });
  if (nattys >= 1) rows.push({ label: "First National Championship", icon: "🏆" });
  if (confTitles >= 1) rows.push({ label: "First Conference Title", icon: "🏅" });
  if (awards >= 5) rows.push({ label: "Award Factory", icon: "⭐" });
  return rows;
}

function dynastyHallOfFameScore(row = {}) {
  return Number((
    (Number(row.wins || 0) * 1.2) +
    (Number(row.nattys || 0) * 45) +
    (Number(row.confTitles || 0) * 18) +
    (Number(row.awards || 0) * 6) +
    (Number(row.heismans || 0) * 18) +
    (Number(row.top10Wins || 0) * 8) +
    (Number(row.prestige || row.rawPrestige || 0) * 0.28)
  ).toFixed(1));
}

function DashboardRedesign({ teams, users, assignments, results, allResults, allAmericans, awards, heismans, nationalChampions, recruiting, teamSeasonStats, currentYear, currentWeek, setCurrentYear, setCurrentWeek, saveSettings, goToTeam, sortState, setSortState }) {
  const [rankingSort, setRankingSort] = useState({ key: "rating", direction: "desc" });
  const activeAssignments = activeAssignmentsForLeague(assignments, teams);
  const activeCoachCount = activeAssignments.length;
  const currentSeasonResults = results.filter((r)=>String(r.season_year)===String(currentYear));
  const rankings = computerRankingRows(teams, currentSeasonResults, assignments, users);
  const prestigeRows = typeof dynastyPrestigeRows === "function" ? dynastyPrestigeRows(teams, assignments, allResults, allAmericans, awards, heismans, nationalChampions, recruiting, teamSeasonStats).slice(0,5) : [];

  const rankingDetails = rankings.map((row, index) => {
    const team = teams.find((team)=>team.id===row.team?.id) || row.team || teams.find((team)=>team.name===row.teamName);
    const rec = team ? recordFromResults(team.id, currentSeasonResults) : { wins:0, losses:0, avgPf:"0.0", avgPa:"0.0" };
    const sor = team ? strengthOfResult(team.id, teams, currentSeasonResults) : "—";
    const top10 = team ? top10Wins(team.id, currentSeasonResults) : 0;
    const assignment = team ? activeCoachForTeam(team.id, assignments) : null;
    const user = assignment ? users.find((u)=>u.id===assignment.discord_user_id)?.discord_username : "CPU";
    const rating = Number(row.rating ?? row.score ?? 0);
    return { ...row, rank:index+1, team, record:rec, sor, top10, user, rating };
  });

  const sortGetters = {
    rank: (row)=>row.rank,
    team: (row)=>row.teamName || row.team?.name || "",
    user: (row)=>row.user || "",
    wins: (row)=>row.record.wins,
    losses: (row)=>row.record.losses,
    avgPf: (row)=>Number(row.record.avgPf || 0),
    avgPa: (row)=>Number(row.record.avgPa || 0),
    top10: (row)=>Number(row.top10 || 0),
    sor: (row)=>row.sor === "—" ? -1 : Number(row.sor),
    rating: (row)=>Number(row.rating || 0),
  };

  const sortedRankingDetails = [...rankingDetails].sort((a,b)=>{
    const getter = sortGetters[rankingSort.key] || sortGetters.rating;
    const av = getter(a);
    const bv = getter(b);
    if (typeof av === "string" || typeof bv === "string") {
      const cmp = String(av).localeCompare(String(bv));
      return rankingSort.direction === "asc" ? cmp : -cmp;
    }
    const cmp = Number(av || 0) - Number(bv || 0);
    return rankingSort.direction === "asc" ? cmp : -cmp;
  });

  function toggleRankingSort(key) {
    setRankingSort((prev)=>({ key, direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc" }));
  }

  const highestSor = rankingDetails
    .filter((row)=>row.sor !== "—" && !Number.isNaN(Number(row.sor)))
    .sort((a,b)=>Number(b.sor)-Number(a.sor))[0];

  const topSorRows = [...rankingDetails]
    .filter((row)=>row.sor !== "—" && !Number.isNaN(Number(row.sor)))
    .sort((a,b)=>Number(b.sor)-Number(a.sor))
    .slice(0,3);

  const topPrestigeRows = prestigeRows.slice(0,3).map((row,index)=>{
    const assignment = activeCoachForTeam(row.team.id, assignments);
    const userName = assignment ? users.find((u)=>u.id===assignment.discord_user_id)?.discord_username : "CPU";
    return { ...row, rank:index+1, user:userName || "CPU" };
  });

  const topAutomaticRows = rankingDetails.slice(0,3);

  const prestigeLeader = topPrestigeRows[0];

  const tileData = [
    { label:"Top 3 Automatic Rankings", value:"", sub: topAutomaticRows.length ? topAutomaticRows.map((row)=>`#${row.rank} ${row.teamName} — ${row.user} • ${Number(row.rating || 0).toFixed(1)}`) : ["No rankings yet"], team:topAutomaticRows[0]?.team },
    { label:"Top 3 SOR", value:"", sub: topSorRows.length ? topSorRows.map((row)=>`#${row.rank} ${row.teamName} — ${row.user} • ${row.sor}`) : ["No games yet"], team:topSorRows[0]?.team },
    { label:"Top 3 Prestige Leaders", value:"", sub: topPrestigeRows.length ? topPrestigeRows.map((row)=>`#${row.rank} ${row.team.name} — ${row.user} • ${row.score}`) : ["No prestige yet"], team:topPrestigeRows[0]?.team },
    { label:"Active Coaches", value: activeCoachCount, sub: "of 32", team:null },
  ];

  const headerCells = [
    ["rank","Rank"],
    ["team","Team"],
    ["user","User"],
    ["wins","W"],
    ["losses","L"],
    ["avgPf","Avg PF"],
    ["avgPa","Avg PA"],
    ["top10","Top 10"],
    ["sor","SOR"],
    ["rating","Rating"],
  ];

  const headlineRows = dynastyWireItems({ rankingDetails, results: allResults, teams, recruiting, prestigeRows, currentYear });

  return (
    <div style={dashboardProV37}>
      <section style={dashboardHeroV37}>
        <div>
          <div style={dashboardKickerPro}>CFBELITE 27 • DYNASTY HQ</div>
          <h1 style={dashboardTitleV37}>Dynasty Headquarters</h1>
          <p style={dashboardSubPro}>Season {currentYear} • {currentWeek}</p>
        </div>
        <div style={dashboardControlsPro}>
          <label style={v29ControlLabel}>Season<select style={v29Select} value={currentYear} onChange={(e)=>setCurrentYear(e.target.value)}>{YEARS.map((year)=><option key={year}>{year}</option>)}</select></label>
          <label style={v29ControlLabel}>Week<select style={v29Select} value={currentWeek} onChange={(e)=>setCurrentWeek(e.target.value)}>{WEEKS.map((week)=><option key={week}>{week}</option>)}</select></label>
          <button style={v29SaveButton} onClick={saveSettings}>Save</button>
        </div>
      </section>

      <section style={dashboardKpiPro}>
        {tileData.map((tile)=>{
          const primary = getTeamPrimary(tile.team);
          const secondary = getTeamSecondary(tile.team);
          return (
            <div key={tile.label} style={{...dashboardKpiCardPro, background: tile.team ? `linear-gradient(135deg, ${primary}aa, rgba(2,6,23,.96) 64%, ${secondary}33)` : dashboardKpiCardPro.background, borderColor: tile.team ? `${secondary}77` : "rgba(148,163,184,.16)"}}>
              <span>{tile.label}</span>
              {tile.value !== "" && <b>{tile.value}</b>}
              <div style={dashboardTileLinesV47}>
                {(Array.isArray(tile.sub) ? tile.sub : [tile.sub]).map((line, i)=><small key={i} style={dashboardTileSubV45}>{line}</small>)}
              </div>
            </div>
          );
        })}
      </section>

      <section style={dashboardRankPanelFullV37}>
        <div style={dashboardPanelHeaderPro}>
          <span>CFBELITE AUTOMATIC RANKINGS</span>
          <h2>Sortable Power Table</h2>
        </div>
        <div style={dashboardTableHeadPro}>
          {headerCells.map(([key,label])=>(
            <button key={key} style={dashboardHeaderButtonPro} onClick={()=>toggleRankingSort(key)}>
              {label}{rankingSort.key === key ? (rankingSort.direction === "asc" ? " ↑" : " ↓") : ""}
            </button>
          ))}
        </div>
        <div style={dashboardRankingListPro}>
          {sortedRankingDetails.map((row)=>{
            const team = row.team;
            const primary = getTeamPrimary(team);
            const secondary = getTeamSecondary(team);
            return (
              <button key={team?.id || row.teamName || row.rank} style={{...dashboardRankRowPro, background:`linear-gradient(100deg, ${primary}70, rgba(15,23,42,.92) 42%, ${secondary}28)`, borderColor:`${secondary}77`}} onClick={()=>team?.id && goToTeam(team.id)}>
                <em style={dashboardRankNumberV47}>#{row.rank}</em>
                <span style={dashboardTeamCellPro}><TeamLogoMark team={team} size={34}/><strong>{row.teamName || team?.name}</strong></span>
                <span>{row.user}</span>
                <span>{row.record.wins}</span>
                <span>{row.record.losses}</span>
                <span>{row.record.avgPf}</span>
                <span>{row.record.avgPa}</span>
                <span>{row.top10}</span>
                <span>{row.sor}</span>
                <b>{Number(row.rating || 0).toFixed(1)}</b>
              </button>
            );
          })}
        </div>
      </section>
      <section style={dashboardWirePanelV38}>
        <div style={dashboardPanelHeaderPro}><span>DYNASTY WIRE</span><h2>The Wire</h2></div>
        <div style={dashboardNewsListPro}>
          {headlineRows.length ? headlineRows.map((item,index)=>(
            <div key={index} style={dashboardNewsRowPro}><span>{item.icon || "🏈"}</span><div style={wireTextStackV45}><b>{item.title}</b><small>{item.meta}</small></div></div>
          )) : <div style={mutedText}>No storylines yet. Add results in League Data Center.</div>}
        </div>
      </section>

    </div>
  );
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
        <div style={homeHeroTile}><span>Draft Room</span><b>{gotw ? `${gotw.team_1?.name || "Team 1"} vs ${gotw.team_2?.name || "Team 2"}` : "Open board"}</b></div>
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
    [ "Import Weekly Matchups"],
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


function draftNumberValue(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function draftPrestigeStars(team) {
  const raw = team?.draft_prestige ?? team?.school_prestige ?? team?.prestige_grade ?? team?.prestige ?? "";
  if (raw === "" || raw === null || raw === undefined) return "—";
  const n = Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  const clamped = Math.max(0, Math.min(5, n));
  return "★".repeat(Math.round(clamped)) + (clamped < 5 ? "☆".repeat(5 - Math.round(clamped)) : "");
}

function draftTeamRating(team) {
  const prestigeRaw = team?.draft_prestige ?? team?.school_prestige ?? team?.prestige_grade;
  const ovrRaw = team?.draft_overall ?? team?.overall_rating ?? team?.ovr;
  const offRaw = team?.draft_offense ?? team?.offense_rating ?? team?.off;
  const defRaw = team?.draft_defense ?? team?.defense_rating ?? team?.def;
  const hasAny = [prestigeRaw, ovrRaw, offRaw, defRaw].some((value)=>value !== "" && value !== null && value !== undefined);
  if (!hasAny) return "—";
  const prestige = Math.max(0, Math.min(5, draftNumberValue(prestigeRaw, 0)));
  const prestigeRating = prestige * 20;
  const ovr = draftNumberValue(ovrRaw, 0);
  const off = draftNumberValue(offRaw, 0);
  const def = draftNumberValue(defRaw, 0);
  const rating = (ovr * 0.40) + (off * 0.20) + (def * 0.20) + (prestigeRating * 0.20);
  return Number(rating.toFixed(1));
}

function draftConferencePowerScore(row) {
  if (!row || !row.ratedTeams) return "—";
  const prestigeRating = row.avgPrestige * 20;
  const score = (row.avgOvr * 0.40) + (row.avgOff * 0.20) + (row.avgDef * 0.20) + (prestigeRating * 0.20);
  return Number(score.toFixed(1));
}

function draftRatingAverage(values) {
  const nums = values.map((value)=>Number(value)).filter((value)=>Number.isFinite(value));
  if (!nums.length) return null;
  return Number((nums.reduce((sum,value)=>sum+value,0)/nums.length).toFixed(1));
}

function draftRatingLine(team) {
  const off = team?.draft_offense ?? team?.offense_rating ?? team?.off ?? "—";
  const def = team?.draft_defense ?? team?.defense_rating ?? team?.def ?? "—";
  const ovr = team?.draft_overall ?? team?.overall_rating ?? team?.ovr ?? "—";
  return `Prestige ${draftPrestigeStars(team)} | OFF ${off} | DEF ${def} | OVR ${ovr}`;
}

function DraftRoom({ teams = [], users = [], picks = [], settings = {}, startClock, pauseClock, resumeClock, announcePick, revealPick, undoPick }) {
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [teamSearch, setTeamSearch] = useState("");
  const [timerMinutes, setTimerMinutes] = useState(settings?.timer_minutes || 10);
  const [localClock, setLocalClock] = useState(null);
  const [tick, setTick] = useState(Date.now());
  const [localPaused, setLocalPaused] = useState(Boolean(settings?.paused));
  const [localPicks, setLocalPicks] = useState(picks || []);
  const [manualPickNumber, setManualPickNumber] = useState(1);
  const [conferenceTeamSort, setConferenceTeamSort] = useState("name");

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setLocalPicks(picks || []);
  }, [picks]);

  useEffect(() => {
    setLocalPaused(Boolean(settings?.paused));
  }, [settings?.paused]);

  const eligibleTeamNames = new Set([
    "Army Black Knights","Charlotte 49ers","East Carolina Pirates","Florida Atlantic Owls","Memphis Tigers","Navy Midshipmen","North Texas Mean Green","Rice Owls","South Florida Bulls","USF Bulls","Temple Owls","Tulane Green Wave","Tulsa Golden Hurricane","UAB Blazers","UTSA Roadrunners",
    "Delaware Fightin’ Blue Hens","FIU Panthers","Jacksonville State Gamecocks","Kennesaw State Owls","Liberty Flames","Middle Tennessee Blue Raiders","Missouri State Bears","New Mexico State Aggies","Sam Houston Bearkats","Western Kentucky Hilltoppers",
    "Akron Zips","Ball State Cardinals","Bowling Green Falcons","Buffalo Bulls","Central Michigan Chippewas","Eastern Michigan Eagles","Kent State Golden Flashes","Miami (OH) RedHawks","Ohio Bobcats","Sacramento State Hornets","Sacremento State","Toledo Rockets","UMass Minutemen","Western Michigan Broncos",
    "Air Force Falcons","Hawaii Rainbow Warriors","Nevada Wolf Pack","New Mexico Lobos","North Dakota State","North Dakota State Bison","Northern Illinois Huskies","San Jose State Spartans","UNLV Rebels","UTEP Miners","Wyoming Cowboys",
    "Boise State Broncos","Colorado State Rams","Fresno State Bulldogs","Oregon State Beavers","San Diego State Aztecs","Texas State Bobcats","Utah State Aggies","Washington State Cougars",
    "Appalachian State Mountaineers","Arkansas State Red Wolves","Coastal Carolina Chanticleers","Georgia Southern Eagles","Georgia State Panthers","James Madison Dukes","Louisiana Ragin’ Cajuns","Louisiana Tech Bulldogs","Louisiana-Monroe Warhawks","Marshall Thundering Herd","Old Dominion Monarchs","South Alabama Jaguars","Southern Miss Golden Eagles","Troy Trojans"
  ]);

  function cleanConference(conf) {
    const value = String(conf || "").trim();
    const upper = value.toUpperCase();
    if (upper === "PAC-12" || upper === "PAC 12") return "PAC 12";
    if (upper === "CONFERENCE USA" || upper === "C-USA" || upper === "CUSA") return "CUSA";
    if (upper === "MOUNTAIN WEST") return "Mountain West";
    if (upper === "SUN BELT") return "Sun Belt";
    if (upper === "AMERICAN" || upper === "AAC") return "American";
    if (upper === "MAC") return "MAC";
    return value;
  }

  const allowedConferences = ["American", "CUSA", "MAC", "Mountain West", "PAC 12", "Sun Belt"];
  const sortedPicks = [...(localPicks || [])].sort((a, b) => Number(a.pick_number || 0) - Number(b.pick_number || 0));
  const currentPick =
    sortedPicks.find((pick) => Number(pick.pick_number) === Number(manualPickNumber || 1)) ||
    sortedPicks.find((pick) => Number(pick.pick_number) === 1) ||
    sortedPicks.find((pick) => !pick.team_id || pick.status === "pick_is_in") ||
    sortedPicks[0] ||
    { pick_number: 1, discord_username: "User TBD", status: "pending" };

  const displayPick = localClock && Number(localClock.pick_number) === Number(currentPick?.pick_number)
    ? { ...currentPick, timer_started_at: localClock.timer_started_at, timer_minutes: localClock.timer_minutes, status: currentPick.status === "picked" ? "picked" : "on_clock" }
    : currentPick;

  const pickedTeamIds = new Set(sortedPicks.filter((pick) => pick.team_id && pick.status === "picked").map((pick) => String(pick.team_id)));
  const reservedTeamIds = new Set(sortedPicks.filter((pick) => pick.team_id).map((pick) => String(pick.team_id)));

  const conferenceCounts = {};
  sortedPicks.forEach((pick) => {
    if (!pick.team_id || pick.status !== "picked") return;
    const team = teams.find((t) => String(t.id) === String(pick.team_id)) || pick.teams;
    const conf = cleanConference(team?.conference);
    if (!conf) return;
    conferenceCounts[conf] = (conferenceCounts[conf] || 0) + 1;
  });

  const conferencesAtSix = allowedConferences.filter((conf) => (conferenceCounts[conf] || 0) >= 6);
  const lockedConferences = new Set();
  conferencesAtSix.slice(0, 2).forEach((conf) => lockedConferences.add(conf));
  if (conferencesAtSix.length >= 2) {
    allowedConferences.forEach((conf) => {
      if (!lockedConferences.has(conf) && (conferenceCounts[conf] || 0) >= 5) lockedConferences.add(conf);
    });
  }

  const conferenceSelections = {};
  allowedConferences.forEach((conf) => {
    conferenceSelections[conf] = [];
  });

  sortedPicks.forEach((pick) => {
    if (!pick.team_id || pick.status !== "picked") return;
    const pickedTeam = teams.find((team) => String(team.id) === String(pick.team_id)) || pick.teams;
    const conf = cleanConference(pickedTeam?.conference);
    if (!conferenceSelections[conf]) return;
    conferenceSelections[conf].push({
      pickNumber: pick.pick_number,
      user: pick.discord_username || pick.discord_users?.discord_username || "User TBD",
      team: pickedTeam?.name || "Selected Team",
    });
  });

  const availableTeams = teams
    .filter((team) => eligibleTeamNames.has(team.name))
    .filter((team) => allowedConferences.includes(cleanConference(team.conference)))
    .filter((team) => !lockedConferences.has(cleanConference(team.conference)))
    .filter((team) => !reservedTeamIds.has(String(team.id)))
    .filter((team) => {
      const q = teamSearch.toLowerCase();
      return !q || team.name.toLowerCase().includes(q) || cleanConference(team.conference).toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const confCompare = cleanConference(a.conference).localeCompare(cleanConference(b.conference));
      if (confCompare !== 0) return confCompare;
      return a.name.localeCompare(b.name);
    });


  function draftSortValue(team, key) {
    if (key === "boardScore") {
      const score = draftTeamRating(team);
      return score === "—" ? -1 : Number(score);
    }
    if (key === "overall") return draftNumberValue(team.draft_overall ?? team.overall_rating ?? team.ovr, -1);
    if (key === "offense") return draftNumberValue(team.draft_offense ?? team.offense_rating ?? team.off, -1);
    if (key === "defense") return draftNumberValue(team.draft_defense ?? team.defense_rating ?? team.def, -1);
    if (key === "prestige") return draftNumberValue(team.draft_prestige ?? team.school_prestige ?? team.prestige_grade, -1);
    return String(team.name || "");
  }

  function sortConferenceTeams(list) {
    return [...list].sort((a,b)=>{
      if (conferenceTeamSort === "name") return String(a.name || "").localeCompare(String(b.name || ""));
      const av = draftSortValue(a, conferenceTeamSort);
      const bv = draftSortValue(b, conferenceTeamSort);
      return Number(bv) - Number(av) || String(a.name || "").localeCompare(String(b.name || ""));
    });
  }

  const availableTeamsByConference = allowedConferences
    .map((conf) => ({
      conference: conf,
      locked: lockedConferences.has(conf),
      teams: availableTeams.filter((team) => cleanConference(team.conference) === conf),
      selectedCount: conferenceCounts[conf] || 0,
    }))
    .filter((group) => group.teams.length || group.locked || group.selectedCount > 0);

  const bestAvailableTeams = [...availableTeams]
    .sort((a,b)=>draftTeamRating(b)-draftTeamRating(a) || a.name.localeCompare(b.name))
    .slice(0,14);

  const bestOffenseAvailable = [...availableTeams]
    .filter((team)=>team.draft_offense || team.offense_rating || team.off)
    .sort((a,b)=>draftNumberValue(b.draft_offense ?? b.offense_rating ?? b.off, 0)-draftNumberValue(a.draft_offense ?? a.offense_rating ?? a.off, 0))
    .slice(0,5);
  const bestDefenseAvailable = [...availableTeams]
    .filter((team)=>team.draft_defense || team.defense_rating || team.def)
    .sort((a,b)=>draftNumberValue(b.draft_defense ?? b.defense_rating ?? b.def, 0)-draftNumberValue(a.draft_defense ?? a.defense_rating ?? a.def, 0))
    .slice(0,5);
  const highestPrestigeAvailable = [...availableTeams]
    .filter((team)=>team.draft_prestige || team.school_prestige || team.prestige_grade)
    .sort((a,b)=>draftNumberValue(b.draft_prestige ?? b.school_prestige ?? b.prestige_grade, 0)-draftNumberValue(a.draft_prestige ?? a.school_prestige ?? a.prestige_grade, 0))
    .slice(0,5);
  const bestValueAvailable = [...availableTeams]
    .filter((team)=>draftTeamRating(team) !== "—")
    .sort((a,b)=>draftTeamRating(b)-draftTeamRating(a))
    .slice(0,5);


  const draftConferencePowerRows = allowedConferences
    .map((conf) => {
      const confTeams = teams.filter((team)=>eligibleTeamNames.has(team.name) && cleanConference(team.conference) === conf);
      const ratedTeams = confTeams.filter((team)=>draftTeamRating(team) !== "—");
      const avgOvr = draftRatingAverage(ratedTeams.map((team)=>team.draft_overall ?? team.overall_rating ?? team.ovr)) ?? 0;
      const avgOff = draftRatingAverage(ratedTeams.map((team)=>team.draft_offense ?? team.offense_rating ?? team.off)) ?? 0;
      const avgDef = draftRatingAverage(ratedTeams.map((team)=>team.draft_defense ?? team.defense_rating ?? team.def)) ?? 0;
      const avgPrestige = draftRatingAverage(ratedTeams.map((team)=>team.draft_prestige ?? team.school_prestige ?? team.prestige_grade)) ?? 0;
      const row = { conference: conf, totalTeams: confTeams.length, ratedTeams: ratedTeams.length, avgOvr, avgOff, avgDef, avgPrestige };
      return { ...row, powerScore: draftConferencePowerScore(row) };
    })
    .sort((a,b)=>(Number(b.powerScore) || 0) - (Number(a.powerScore) || 0) || a.conference.localeCompare(b.conference));

  const selectedTeam = teams.find((team) => String(team.id) === String(selectedTeamId));
  const stagedPick = sortedPicks.find((pick) => pick.status === "pick_is_in");
  const stagedTeam = stagedPick ? teams.find((team) => String(team.id) === String(stagedPick.team_id)) || stagedPick.teams : null;
  const latestPick = [...sortedPicks].reverse().find((pick) => pick.team_id && pick.status === "picked");
  const latestTeam = latestPick ? teams.find((team) => String(team.id) === String(latestPick.team_id)) || latestPick.teams : null;

  function timeLabel() {
    if (localPaused) return "PAUSED";
    const started = displayPick?.timer_started_at;
    if (!started) return "Clock not started";
    const minutes = Number(displayPick?.timer_minutes || settings?.timer_minutes || timerMinutes || 10);
    const end = new Date(started).getTime() + minutes * 60 * 1000;
    const remaining = Math.max(0, end - tick);
    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function handleStartClock() {
    const started = new Date().toISOString();
    setLocalClock({
      pick_number: currentPick?.pick_number,
      timer_started_at: started,
      timer_minutes: Number(timerMinutes) || 10,
    });
    if (startClock) startClock(currentPick?.pick_number, timerMinutes);
  }

  function handlePauseClock() {
    setLocalPaused(true);
    if (pauseClock) pauseClock();
  }

  function handleResumeClock() {
    setLocalPaused(false);
    if (resumeClock) resumeClock();
  }

  function handlePickIsIn() {
    if (!selectedTeamId) {
      alert("Select a team first.");
      return;
    }

    const now = new Date().toISOString();
    setLocalPicks((prev) => (prev || []).map((pick) =>
      Number(pick.pick_number) === Number(currentPick?.pick_number)
        ? { ...pick, team_id: selectedTeamId, picked_at: now, status: "pick_is_in" }
        : pick
    ));

    if (announcePick) announcePick(currentPick?.pick_number, selectedTeamId);
  }

  function handleRevealPick(pickNumber) {
    const nextPick = Number(pickNumber) + 1;
    const now = new Date().toISOString();

    setLocalPicks((prev) => (prev || []).map((pick) => {
      if (Number(pick.pick_number) === Number(pickNumber)) return { ...pick, status: "picked" };
      if (Number(pick.pick_number) === nextPick) return { ...pick, timer_started_at: now, timer_minutes: Number(timerMinutes) || 10, status: "on_clock" };
      return pick;
    }));

    setManualPickNumber(nextPick);
    setLocalClock({ pick_number: nextPick, timer_started_at: now, timer_minutes: Number(timerMinutes) || 10 });
    if (revealPick) revealPick(pickNumber);
  }

  function handleUndoPick(pickNumber) {
    setLocalPicks((prev) => (prev || []).map((pick) =>
      Number(pick.pick_number) === Number(pickNumber)
        ? { ...pick, team_id: null, picked_at: null, timer_started_at: null, status: "pending" }
        : pick
    ));
    if (undoPick) undoPick(pickNumber);
  }

  function copyCaption(pick, team) {
    if (!pick || !team) return;
    const caption = `🚨 THE PICK IS IN 🚨\n\nWith Pick #${String(pick.pick_number).padStart(2, "0")} in the CFBElite 27 Team Draft...\n\n${pick.discord_username || pick.discord_users?.discord_username || "A CFBElite user"} selects the ${team.name}!\n\nWelcome to ${cleanConference(team.conference) || "CFBElite"}.`;
    navigator.clipboard?.writeText(caption);
  }

  function downloadGraphic(pick, team) {
    if (!pick || !team) return;

    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 1000;
    const ctx = canvas.getContext("2d");

    const primary = team.primary_color || "#2d0b6e";
    const secondary = team.secondary_color || "#facc15";
    const accent = team.accent_color || "#ffffff";
    const user = String(pick.discord_username || pick.discord_users?.discord_username || "CFBElite User").toUpperCase();
    const teamName = String(team.name || "Selected Team").toUpperCase();
    const parts = teamName.split(" ");
    const mascot = parts.length > 1 ? parts[parts.length - 1] : "";
    const school = parts.length > 1 ? parts.slice(0, -1).join(" ") : teamName;
    const conf = cleanConference(team.conference) || "CFBElite";
    const pickNo = String(pick.pick_number || 1).padStart(2, "0");
    const initials = teamName.split(" ").map((word) => word[0]).join("").slice(0, 4);

    function roundRect(x, y, w, h, r) {
      const radius = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + w, y, x + w, y + h, radius);
      ctx.arcTo(x + w, y + h, x, y + h, radius);
      ctx.arcTo(x, y + h, x, y, radius);
      ctx.arcTo(x, y, x + w, y, radius);
      ctx.closePath();
    }

    function fitText(label, x, y, maxWidth, startSize, minSize, color = "#fff", weight = 1000, italic = false) {
      let size = startSize;
      do {
        ctx.font = `${italic ? "italic " : ""}${weight} ${size}px Arial Black, Impact, Arial`;
        if (ctx.measureText(label).width <= maxWidth || size <= minSize) break;
        size -= 2;
      } while (size > minSize);
      ctx.fillStyle = color;
      ctx.fillText(label, x, y);
      return size;
    }

    function drawPaintStroke(x, y, w, h, color, alpha = 0.88) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, y + h * .25);
      ctx.lineTo(x + w * .88, y);
      ctx.lineTo(x + w, y + h * .58);
      ctx.lineTo(x + w * .10, y + h);
      ctx.closePath();
      ctx.fill();
      for (let i = 0; i < 12; i++) {
        ctx.globalAlpha = alpha * .45;
        ctx.fillRect(x + Math.random() * w, y + Math.random() * h, Math.random() * 140 + 30, Math.random() * 5 + 2);
      }
      ctx.restore();
    }

    function grunge(color, count, alpha) {
      ctx.save();
      ctx.fillStyle = color;
      for (let i = 0; i < count; i++) {
        ctx.globalAlpha = Math.random() * alpha;
        const size = Math.random() * 4 + 1;
        ctx.fillRect(Math.random() * 1600, Math.random() * 1000, size, size);
      }
      ctx.restore();
    }

    // Dark stadium-style background
    const bg = ctx.createLinearGradient(0, 0, 1600, 1000);
    bg.addColorStop(0, "#03030a");
    bg.addColorStop(.25, primary);
    bg.addColorStop(.50, "#050510");
    bg.addColorStop(.78, "#050510");
    bg.addColorStop(1, primary);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1600, 1000);

    // Crowd/stadium bands
    ctx.fillStyle = "rgba(255,255,255,.055)";
    ctx.fillRect(0, 150, 1600, 80);
    ctx.fillStyle = "rgba(255,255,255,.035)";
    ctx.fillRect(0, 230, 1600, 64);
    ctx.fillStyle = "rgba(0,0,0,.60)";
    ctx.fillRect(0, 0, 1600, 1000);

    // Stadium lights
    const leftLight = ctx.createRadialGradient(75, 45, 5, 75, 45, 350);
    leftLight.addColorStop(0, "rgba(255,255,255,.96)");
    leftLight.addColorStop(.12, `${secondary}66`);
    leftLight.addColorStop(.40, "rgba(255,255,255,.10)");
    leftLight.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = leftLight;
    ctx.fillRect(0, 0, 420, 300);

    const rightLight = ctx.createRadialGradient(1525, 45, 5, 1525, 45, 350);
    rightLight.addColorStop(0, "rgba(255,255,255,.96)");
    rightLight.addColorStop(.12, `${secondary}66`);
    rightLight.addColorStop(.40, "rgba(255,255,255,.10)");
    rightLight.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = rightLight;
    ctx.fillRect(1180, 0, 420, 300);

    // Smoke / grunge
    grunge("#ffffff", 800, .20);
    grunge(secondary, 280, .22);
    grunge(primary, 550, .30);

    // Border
    ctx.strokeStyle = primary;
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, 1572, 972);
    ctx.strokeStyle = secondary;
    ctx.lineWidth = 3;
    ctx.strokeRect(32, 32, 1536, 936);

    // Top header
    ctx.fillStyle = "rgba(255,255,255,.84)";
    ctx.font = "900 30px Arial";
    ctx.fillText("C  F  B  E  L  I  T  E     2  7", 170, 100);
    ctx.fillText("T  E  A  M     D  R  A  F  T", 1050, 100);

    // Center crest-like badge
    roundRect(615, 32, 370, 205, 32);
    ctx.fillStyle = "rgba(0,0,0,.78)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.30)";
    ctx.lineWidth = 4;
    ctx.stroke();

    fitText("CFBELITE", 668, 112, 275, 55, 42, "#fff");
    fitText("27", 745, 178, 120, 72, 54, secondary);
    fitText("DRAFT", 704, 224, 195, 42, 32, "#fff");

    // Pick is in brush
    drawPaintStroke(96, 180, 520, 98, primary, .88);
    fitText("THE PICK IS IN", 136, 252, 430, 54, 38, "#fff", 1000, true);

    // Left pick box
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.55)";
    ctx.shadowBlur = 24;
    ctx.fillStyle = "rgba(0,0,0,.68)";
    ctx.fillRect(118, 335, 320, 425);
    ctx.restore();

    ctx.strokeStyle = primary;
    ctx.lineWidth = 3;
    ctx.strokeRect(118, 335, 320, 425);

    const pickHeader = ctx.createLinearGradient(118, 335, 438, 335);
    pickHeader.addColorStop(0, primary);
    pickHeader.addColorStop(1, "rgba(0,0,0,.55)");
    ctx.fillStyle = pickHeader;
    ctx.fillRect(118, 335, 320, 86);

    fitText("PICK", 203, 394, 160, 58, 44, "#fff");
    fitText(pickNo, 142, 705, 265, 230, 170, "#fff");

    // Main content
    const userBar = ctx.createLinearGradient(500, 300, 1090, 300);
    userBar.addColorStop(0, primary);
    userBar.addColorStop(.5, `${secondary}`);
    userBar.addColorStop(1, primary);
    ctx.fillStyle = userBar;
    ctx.fillRect(500, 300, 590, 76);
    fitText(user, 610, 355, 390, 48, 30, "#fff");

    ctx.strokeStyle = primary;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(516, 432);
    ctx.lineTo(655, 432);
    ctx.moveTo(930, 432);
    ctx.lineTo(1065, 432);
    ctx.stroke();

    fitText("SELECTS", 672, 449, 250, 58, 42, primary, 1000, true);

    fitText(school, 525, 610, 605, 124, 56, "#fff");
    if (mascot) fitText(mascot, 515, 710, 610, 78, 46, primary, 1000, true);

    // Helmet-style team orb on right
    ctx.save();
    ctx.translate(1285, 520);
    const helmetGrad = ctx.createRadialGradient(-75, -95, 20, 0, 0, 300);
    helmetGrad.addColorStop(0, `${secondary}bb`);
    helmetGrad.addColorStop(.38, primary);
    helmetGrad.addColorStop(.83, "#080812");
    helmetGrad.addColorStop(1, "rgba(0,0,0,.92)");
    ctx.fillStyle = helmetGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, 300, 245, -0.10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.45)";
    ctx.lineWidth = 5;
    ctx.stroke();

    // face mask hint
    ctx.strokeStyle = "rgba(0,0,0,.72)";
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(-80, 92);
    ctx.lineTo(245, 92);
    ctx.moveTo(15, 130);
    ctx.lineTo(270, 130);
    ctx.moveTo(185, 70);
    ctx.lineTo(250, 165);
    ctx.stroke();

    fitText(initials, -145, 30, 275, 105, 62, "#fff");
    ctx.restore();

    // Smoke under helmet
    ctx.save();
    ctx.globalAlpha = .65;
    ctx.fillStyle = primary;
    for (let i = 0; i < 22; i++) {
      ctx.beginPath();
      ctx.ellipse(1020 + i * 24, 790 + Math.sin(i) * 14, 82, 24, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Conference badge
    roundRect(660, 770, 280, 84, 24);
    ctx.fillStyle = "rgba(0,0,0,.72)";
    ctx.fill();
    ctx.strokeStyle = secondary;
    ctx.lineWidth = 3;
    ctx.stroke();
    fitText(conf.toUpperCase(), 700, 827, 200, 42, 26, "#fff");

    // Footer
    fitText("#CFBELITE27", 85, 912, 220, 34, 26, "#fff");
    ctx.fillStyle = secondary;
    ctx.font = "900 38px Arial";
    ctx.fillText("★ ★ ★ ★ ★", 330, 918);

    fitText("WELCOME TO", 1185, 850, 270, 42, 30, "#fff", 1000, true);
    fitText(mascot || school, 1095, 932, 420, 68, 38, primary, 1000, true);

    const link = document.createElement("a");
    link.download = `cfbelite27-pick-${pickNo}-${teamName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }


  const S = {
    page: { display: "grid", gap: 18 },
    panel: { background: "rgba(15,23,42,.78)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 22, padding: 18, boxShadow: "0 20px 60px rgba(0,0,0,.30)" },
    hero: { background: "linear-gradient(135deg, rgba(49,46,129,.92), rgba(15,23,42,.88))", border: "1px solid rgba(250,204,21,.28)", borderRadius: 26, padding: 22, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18, alignItems: "center" },
    title: { margin: 0, color: "#fff", fontSize: "clamp(38px, 8vw, 78px)", lineHeight: .9, letterSpacing: "-.055em", fontWeight: 1000 },
    eyebrow: { color: "#facc15", textTransform: "uppercase", letterSpacing: ".16em", fontSize: 12, fontWeight: 1000 },
    muted: { color: "rgba(255,255,255,.72)", lineHeight: 1.45 },
    clock: { color: "#facc15", fontSize: "clamp(42px, 10vw, 88px)", fontWeight: 1000, lineHeight: .9 },
    grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 },
    availableConferenceStack: { display: "grid", gap: 14, marginTop: 14 },
    availableConferenceGroup: { display: "grid", gap: 10 },
    availableConferenceHeader: { border: "1px solid rgba(255,255,255,.18)", borderRadius: 14, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, color: "#ffffff", fontWeight: 1000, fontSize: 13, textTransform: "uppercase", letterSpacing: ".08em" },
    availableTeamGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 },
    input: { width: "100%", border: "1px solid rgba(255,255,255,.16)", background: "rgba(255,255,255,.08)", color: "#fff", borderRadius: 14, padding: "12px 14px", fontWeight: 800 },
    button: { border: "1px solid rgba(250,204,21,.32)", background: "linear-gradient(135deg, #facc15, #b45309)", color: "#111827", borderRadius: 14, padding: "12px 14px", fontWeight: 1000, cursor: "pointer", minHeight: 46 },
    ghost: { border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.08)", color: "#fff", borderRadius: 14, padding: "12px 14px", fontWeight: 900, cursor: "pointer", minHeight: 46 },
    pickTile: { background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 16, padding: 12, display: "grid", gap: 7 },
    activePickRow: { marginTop: 14, border: "1px solid rgba(250,204,21,.38)", background: "rgba(250,204,21,.08)", borderRadius: 16, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
    activePickTeam: { color: "#facc15", fontSize: "clamp(20px, 5vw, 30px)", fontWeight: 1000, lineHeight: 1.05 },
    activePickMeta: { color: "rgba(255,255,255,.78)", fontWeight: 900, whiteSpace: "nowrap" },
    twoCol: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 },
  };

  const recentPicked = [...sortedPicks].filter((pick)=>pick.team_id && pick.status === "picked").slice(-8).reverse();

  return (
    <section style={draftBroadcastPageV37} className="cfb-mobile-page">
      <div style={draftOnClockHeroV37}>
        <div style={draftOnClockMainV37}>
          <div style={draftBroadcastEyebrowV40}>ON THE CLOCK</div>
          <h1 style={draftOnClockNameV37}>{displayPick?.discord_username || displayPick?.discord_users?.discord_username || "User TBD"}</h1>
          <div style={draftOnClockMetaV37}>Pick #{String(displayPick?.pick_number || 1).padStart(2, "0")}</div>
        </div>
        <div style={draftTimerCardV37}>
          <span>{displayPick?.status === "pick_is_in" ? "THE PICK IS IN" : "CLOCK"}</span>
          <b>{timeLabel()}</b>
        </div>
      </div>

      <div style={draftLowerThirdV38}>
        <span>CFBELITE 27 DRAFTCAST</span>
        <b>{displayPick?.status === "pick_is_in" ? "The pick is in" : `${displayPick?.discord_username || displayPick?.discord_users?.discord_username || "User TBD"} is on the clock`}</b>
        <small>Pick #{String(displayPick?.pick_number || 1).padStart(2, "0")} • {availableTeams.length} teams available</small>
      </div>

      <div style={draftEspnTickerV38}>
        <div className="cfb-draft-ticker-track" style={draftTickerTrackV39}>
          {([...((recentPicked.length ? recentPicked : sortedPicks.slice(0,8))), ...((recentPicked.length ? recentPicked : sortedPicks.slice(0,8)))].map((pick, index)=> {
            const team = teams.find((t)=>String(t.id)===String(pick.team_id)) || pick.teams;
            return <span key={`${pick.pick_number}-${index}`}>#{pick.pick_number} {pick.discord_username || pick.discord_users?.discord_username || "User TBD"} {team ? `→ ${team.name}` : "on deck"}</span>;
          }))}
        </div>
      </div>

      <div style={draftControlBarV37}>
        <select title="Manual current pick override" style={S.input} value={manualPickNumber} onChange={(e) => setManualPickNumber(Number(e.target.value))}>
          {sortedPicks.map((pick) => (
            <option style={{color:"#111827", background:"#fff"}} key={pick.pick_number} value={pick.pick_number}>
              Pick #{String(pick.pick_number).padStart(2, "0")} - {pick.discord_username || pick.discord_users?.discord_username || "User TBD"}
            </option>
          ))}
        </select>
        <input style={S.input} type="number" min="1" max="60" value={timerMinutes} onChange={(e) => setTimerMinutes(e.target.value)} placeholder="Clock minutes" />
        <select style={S.input} value={selectedTeamId} onChange={(e) => setSelectedTeamId(e.target.value)}>
          <option style={{color:"#111827", background:"#fff"}} value="">Select Team For Pick #{displayPick?.pick_number || ""}</option>
          {availableTeams.map((team) => (
            <option style={{color:"#111827", background:"#fff"}} key={team.id} value={team.id}>{team.name} - {cleanConference(team.conference)}</option>
          ))}
        </select>
        <button style={S.button} type="button" onClick={handleStartClock}>Start / Reset Clock</button>
        <button style={S.ghost} type="button" onClick={handlePauseClock}>Pause</button>
        <button style={S.ghost} type="button" onClick={handleResumeClock}>Resume</button>
        <button style={S.button} type="button" disabled={!selectedTeamId} onClick={handlePickIsIn}>Pick Is In</button>
      </div>

      {(selectedTeam || stagedTeam) && (
        <div style={pickPreviewCard}>
          <div style={S.eyebrow}>{stagedTeam ? "Pick Is In" : "Selected Team"}</div>
          <div style={pickTeamLine}>{(stagedTeam || selectedTeam)?.name}</div>
          <div style={S.muted}>Pick #{String((stagedPick || currentPick)?.pick_number || 1).padStart(2, "0")} · {cleanConference((stagedTeam || selectedTeam)?.conference)} · {draftRatingLine(stagedTeam || selectedTeam)}</div>
        </div>
      )}

      <section style={draftBestAvailableStripV40}>
        <div style={draftBestHeaderV40}>
          <span>BEST AVAILABLE</span>
          <b>War Room Board</b>
        </div>
        <div style={draftBestGridV40}>
          {bestAvailableTeams.map((team, index)=>(
            <button key={team.id} style={{...draftBestTileV43, background:`linear-gradient(145deg, ${getTeamPrimary(team)}cc, rgba(2,6,23,.96))`, borderColor:getTeamSecondary(team)}} onClick={()=>setSelectedTeamId(team.id)}>
              <div style={draftBestRankV43}>#{index+1}</div>
              <div style={draftBestLogoV43}><TeamLogoMark team={team} size={40}/></div>
              <strong style={draftBestTeamNameV43}>{team.name}</strong>
              <div style={draftBestStarsV43}>{draftPrestigeStars(team)}</div>
              <div style={draftBestRatingsV43}>
                <span>OVR <b>{team.draft_overall ?? team.overall_rating ?? team.ovr ?? "—"}</b></span>
                <span>OFF <b>{team.draft_offense ?? team.offense_rating ?? team.off ?? "—"}</b></span>
                <span>DEF <b>{team.draft_defense ?? team.defense_rating ?? team.def ?? "—"}</b></span>
              </div>
              <div style={draftBestScoreBoxV43}><span>Board Score</span><b>{draftTeamRating(team)}</b></div>
            </button>
          ))}
        </div>
      </section>



      <section style={warRoomModePanelV46}>
        <div style={draftBestHeaderV40}>
          <span>WAR ROOM MODE</span>
          <b>NFL Network Style Draft Analytics</b>
        </div>
        <div style={warRoomModeGridV46}>
          <WarRoomList title="Best Offense Available" rows={bestOffenseAvailable} metric={(team)=>team.draft_offense ?? team.offense_rating ?? team.off ?? "—"} setSelectedTeamId={setSelectedTeamId}/>
          <WarRoomList title="Best Defense Available" rows={bestDefenseAvailable} metric={(team)=>team.draft_defense ?? team.defense_rating ?? team.def ?? "—"} setSelectedTeamId={setSelectedTeamId}/>
          <WarRoomList title="Highest Prestige Available" rows={highestPrestigeAvailable} metric={(team)=>draftPrestigeStars(team)} setSelectedTeamId={setSelectedTeamId}/>
          <WarRoomList title="Best Value Available" rows={bestValueAvailable} metric={(team)=>draftTeamRating(team)} setSelectedTeamId={setSelectedTeamId}/>
        </div>
      </section>

      <section style={draftConferencePowerPanelV42}>
        <div style={draftBestHeaderV40}>
          <span>CONFERENCE POWER INDEX</span>
          <b>Ranked by Average Draft Strength</b>
        </div>
        <div style={draftConferencePowerGridV42}>
          {draftConferencePowerRows.map((row, index)=>(
            <div key={row.conference} style={draftConferencePowerTileV42}>
              <div style={draftConferencePowerTopV42}>
                <span>#{index+1}</span>
                <strong>{row.conference}</strong>
                <b>{row.powerScore}</b>
              </div>
              <div style={draftConferencePowerStatsV42}>
                <span>OVR <b>{row.ratedTeams ? row.avgOvr : "—"}</b></span>
                <span>OFF <b>{row.ratedTeams ? row.avgOff : "—"}</b></span>
                <span>DEF <b>{row.ratedTeams ? row.avgDef : "—"}</b></span>
                <span>PRESTIGE <b>{row.ratedTeams ? row.avgPrestige : "—"}</b></span>
              </div>
              <small>{row.ratedTeams}/{row.totalTeams} teams rated</small>
            </div>
          ))}
        </div>
      </section>
      <section style={draftMainBoardV37} className="cfb-responsive-grid">
        <div style={draftBoardPanelV37} className="cfb-card">
          <div style={S.eyebrow}>Draft Board</div>
          <div style={draftBoardRowsV37}>
            {sortedPicks.map((pick) => {
              const team = teams.find((t) => String(t.id) === String(pick.team_id)) || pick.teams;
              const visible = pick.status === "picked";
              const primary = getTeamPrimary(team);
              const secondary = getTeamSecondary(team);
              return (
                <div key={pick.pick_number} style={{...draftBoardRowV37, background: visible && team ? `linear-gradient(100deg, ${primary}88, rgba(15,23,42,.94), ${secondary}22)` : draftBoardRowV37.background, borderColor: visible && team ? `${secondary}77` : draftBoardRowV37.borderColor}}>
                  <b>#{String(pick.pick_number).padStart(2, "0")}</b>
                  <strong>{pick.discord_username || pick.discord_users?.discord_username || "User TBD"}</strong>
                  <span>{visible && team ? team.name : (pick.status === "pick_is_in" ? "Team hidden until reveal" : "On deck")} {visible && team ? `• ${draftTeamRating(team)}` : ""}</span>
                  <em>{pick.status === "pick_is_in" ? "PICK IS IN" : (pick.status || "pending")}</em>
                  {pick.status === "pick_is_in" && <button style={S.button} type="button" onClick={() => handleRevealPick(pick.pick_number)}>Reveal</button>}
                  {pick.team_id && <button style={S.ghost} type="button" onClick={() => handleUndoPick(pick.pick_number)}>Undo</button>}
                </div>
              );
            })}
          </div>
        </div>

        <aside style={draftAvailablePanelV37} className="cfb-card">
          <div style={S.eyebrow}>Available Teams · {availableTeams.length}</div>
          <input style={{ ...S.input, marginTop: 12 }} value={teamSearch} onChange={(e) => setTeamSearch(e.target.value)} placeholder="Search available teams or conference..." />
          <div style={draftConferenceSortBarV48}>
            <span>Sort conference teams by</span>
            <select style={draftConferenceSortSelectV48} value={conferenceTeamSort} onChange={(e)=>setConferenceTeamSort(e.target.value)}>
              <option value="name">Team Name A-Z</option>
              <option value="boardScore">Board Score</option>
              <option value="overall">Overall Rating</option>
              <option value="offense">Offensive Rating</option>
              <option value="defense">Defensive Rating</option>
              <option value="prestige">Prestige</option>
            </select>
          </div>
          <div style={S.availableConferenceStack}>
            {availableTeamsByConference.map((group) => (
              <div key={group.conference} style={S.availableConferenceGroup}>
                <div style={{
                  ...S.availableConferenceHeader,
                  background: group.locked ? "rgba(127,29,29,.76)" : "rgba(255,255,255,.08)",
                  borderColor: group.locked ? "rgba(248,113,113,.70)" : "rgba(255,255,255,.18)",
                }}>
                  <span>{group.locked ? "🔒 " : ""}{group.conference}</span>
                  <b>{group.locked ? "LOCKED" : `${group.teams.length} Remaining`}</b>
                </div>
                {!group.locked && (
                  <div style={draftAvailableGridV37}>
                    {group.teams.map((team) => (
                      <button key={team.id} style={{
                        ...draftAvailableTileV37,
                        background: `linear-gradient(135deg, ${team.primary_color || "#1f2937"}cc, rgba(15,23,42,.88))`,
                        borderColor: team.secondary_color || "#ffffff",
                      }} onClick={()=>setSelectedTeamId(team.id)}>
                        <TeamLogoMark team={team} size={34}/>
                        <b>{team.name}</b>
                        <span>{cleanConference(team.conference)}</span>
                        <small style={draftTileRatingsV40}>{draftRatingLine(team)}</small>
                        <strong style={draftTileScoreV40}>Board Score: {draftTeamRating(team)}</strong>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section style={draftConferenceGrid}>
        {allowedConferences.map((conf) => {
          const count = conferenceCounts[conf] || 0;
          const locked = lockedConferences.has(conf);
          return (
            <div key={conf} style={locked ? draftConferenceTileLocked : draftConferenceTile}>
              <div style={{display:"flex", justifyContent:"space-between", gap:8, alignItems:"center"}}>
                <b>{conf}</b>
                <span style={{ color: locked ? "#fecaca" : "#bbf7d0", fontWeight: 1000, fontSize: 12 }}>{locked ? "LOCKED" : "OPEN"}</span>
              </div>
              <span style={S.muted}>{count} selected</span>
            </div>
          );
        })}
      </section>
    </section>
  );
}


function WarRoomList({ title, rows = [], metric, setSelectedTeamId }) {
  return (
    <div style={warRoomListV46}>
      <h3>{title}</h3>
      {rows.length ? rows.map((team,index)=>(
        <button key={team.id || team.name} style={warRoomRowV46} onClick={()=>setSelectedTeamId(String(team.id))}>
          <span>#{index+1}</span>
          <TeamLogoMark team={team} size={26}/>
          <b>{team.name}</b>
          <strong>{metric(team)}</strong>
        </button>
      )) : <p style={mutedText}>Add ratings in Team Assets.</p>}
    </div>
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
  if (!game) return `🔥 CFBElite Draft Room\\n\\nNo matchup entered for ${currentYear} ${currentWeek}.`;
  return [`🔥 CFBElite Draft Room`, "", `${game.team_1?.name || "Team 1"} vs ${game.team_2?.name || "Team 2"}`, `Game Score: ${game.game.score}`, `Why: ${game.game.reasons.join(" • ")}`].join("\\n");
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
  return <section style={card}><div style={sectionTop}><div><h2 style={sectionTitle}>Weekly Matchups</h2><p style={mutedText}>Enter scheduled user games for the week. Draft Room is selected automatically by score.</p></div><button style={button} onClick={addMatchup}>Add Matchup</button></div>
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
  if (gotw) lines.push(`🔥 Draft Room: ${gotw.team_1?.name || "Team 1"} vs ${gotw.team_2?.name || "Team 2"} (${gotw.game.score} score)`, "");
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



function CommissionerCenterSafe({ setActiveTab, loadData }) {
  const tools = [
    ["assignments", "User Assignments", "Manage active/former team assignments"],
    ["resultsManager", "Results Manager", "Edit or delete game results"],
    ["recruitingRankings", "Recruiting Manager", "Edit recruiting classes"],
    ["awards", "Awards Manager", "Manage award winners"],
    ["allAmericans", "All-Americans", "Manage All-American records"],
    ["heismans", "Heisman Winners", "Manage Heisman history"],
    ["nationalChampions", "National Champions", "Manage national title records"],
    ["logoManager", "Logo Manager", "Add team logos, helmets, and colors"],
    ["seasonStats", "Season Player Stats", "Review recorded player stats"],
    ["teamStats", "Team Stats", "Review recorded team stats"],
  ];

  return (
    <section style={broadcastCard}>
      <h2 style={sectionTitle}>Commissioner Command Center</h2>
      <p style={mutedText}>A single control room for league data, cleanup, records, logos, stats, recruiting, and history.</p>
      <div style={commishGrid}>
        {tools.map(([key, title, desc])=>(
          <button key={key} style={commishToolCard} onClick={() => setActiveTab(key)}>
            <b>{title}</b>
            <span>{desc}</span>
          </button>
        ))}
        <button style={commishToolCard} onClick={loadData}>
          <b>Refresh Data</b>
          <span>Reload all Supabase data</span>
        </button>
      </div>
      <div style={miniCard}>
        <h3 style={miniTitle}>Data Integrity Checklist</h3>
        <div style={miniRow}>Confirm every active user has one active team.</div>
        <div style={miniRow}>Confirm team logos and helmets are filled in Logo Manager.</div>
        <div style={miniRow}>Confirm every season has recruiting ranks and team stats recorded.</div>
        <div style={miniRow}>Use Results Manager to clean duplicate or incorrect game results.</div>
      </div>
    </section>
  );
}

function LogoManager({ teams, updateRow }) {
  const [searchText, setSearchText] = useState("");
  const filtered = teams.filter((team)=>team.name.toLowerCase().includes(searchText.toLowerCase()));

  return (
    <section style={broadcastCard}>
      <h2 style={sectionTitle}>Team Assets Manager</h2>
      <p style={mutedText}>Input draft-room team data here. Add Prestige 0-5, Overall, Offense, and Defense; Best Available uses those fields to calculate Board Score: OVR 40%, OFF 20%, DEF 20%, Prestige 20%.</p>
      <SearchBox value={searchText} onChange={setSearchText}/>
      <div style={logoManagerGrid}>
        {filtered.map((team)=>(
          <div key={team.id} style={logoManagerCard}>
            <div style={logoPreviewBox}>
              {team.logo_url ? <img src={team.logo_url} alt="" style={logoPreviewImg}/> : <span>No Logo</span>}
            </div>
            <b>{team.name}</b>
            <input style={input} value={team.logo_url || ""} onChange={(e)=>updateRow("teams", team.id, "logo_url", e.target.value)} placeholder="Official Logo URL"/>
            
            <input style={input} value={team.primary_color || ""} onChange={(e)=>updateRow("teams", team.id, "primary_color", e.target.value)} placeholder="Primary Color #000000"/>
            <input style={input} value={team.secondary_color || ""} onChange={(e)=>updateRow("teams", team.id, "secondary_color", e.target.value)} placeholder="Secondary Color #ffffff"/>
            <input style={input} value={team.draft_prestige || ""} onChange={(e)=>updateRow("teams", team.id, "draft_prestige", e.target.value)} placeholder="Draft Prestige 0-5"/>
            <input style={input} value={team.draft_overall || ""} onChange={(e)=>updateRow("teams", team.id, "draft_overall", e.target.value)} placeholder="Overall Rating"/>
            <input style={input} value={team.draft_offense || ""} onChange={(e)=>updateRow("teams", team.id, "draft_offense", e.target.value)} placeholder="Offense Rating"/>
            <input style={input} value={team.draft_defense || ""} onChange={(e)=>updateRow("teams", team.id, "draft_defense", e.target.value)} placeholder="Defense Rating"/>
            <div style={draftAssetPreviewV40}>{draftRatingLine(team)} · Board Score {draftTeamRating(team)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function LeagueDataCenter({ teams, users, assignments, results = [], currentYear, currentWeek, setError, loadData }) {
  const [activeForm, setActiveForm] = useState("results");
  const [result, setResult] = useState({ season_year: currentYear, week: currentWeek, team_1_id:"", team_2_id:"", team_1_score:"", team_2_score:"", team_1_rank:"", team_2_rank:"" });
  const [recruit, setRecruit] = useState({ season_year: currentYear, team_id:"", rank:"", five_stars:"", four_stars:"", three_stars:"", two_stars:"", one_stars:"" });
  const [player, setPlayer] = useState({ season_year: currentYear, player_name:"", discord_user_id:"", team_id:"", position:"QB", games:"", pass_yards:"", pass_tds:"", interceptions:"", rush_yards:"", rush_tds:"", receptions:"", rec_yards:"", rec_tds:"", tackles:"", sacks:"", interceptions_def:"", forced_fumbles:"", fumble_recoveries:"" });
  const [teamStat, setTeamStat] = useState({ season_year: currentYear, team_id:"", discord_user_id:"", points_per_game:"", avg_yards_per_game:"", avg_pass_yards_per_game:"", avg_rush_yards_per_game:"", avg_total_yards_allowed:"", total_ppg_allowed:"", avg_rush_yards_allowed:"", avg_pass_yards_allowed:"", sacks:"", tfls:"", turnovers:"", takeaways:"", turnover_margin:"" });
  const [award, setAward] = useState({ season_year: currentYear, player_name:"", team_id:"", position:"QB", award_name: AWARD_NAMES[0] });
  const [aa, setAa] = useState({ season_year: currentYear, player_name:"", team_id:"", position:"QB", type:"First-Team" });

  const n = (value) => value === "" || value === null || value === undefined ? null : Number(value);
  const assignedUserForTeam = (teamId, year=currentYear) => {
    const assignment = coachForTeamYear(teamId, year, assignments) || assignments.find((a)=>a.team_id===teamId && a.status==="Active");
    return users.find((user)=>user.id === assignment?.discord_user_id) || null;
  };

  const currentSeasonResultsForRanks = (results || []).filter((row)=>String(row.season_year) === String(result.season_year || currentYear));
  const userControlledTeamIdsForRanks = new Set(
    assignments
      .filter((assignment)=>assignment.status === "Active" && assignment.discord_user_id && assignment.team_id)
      .map((assignment)=>String(assignment.team_id))
  );
  const automaticRankRows = computerRankingRows(teams, currentSeasonResultsForRanks, assignments, users)
    .filter((row)=>userControlledTeamIdsForRanks.has(String(row.team?.id)));
  const automaticRankMap = new Map(automaticRankRows.map((row)=>[String(row.team?.id), row.rank]));
  const autoRankForTeam = (teamId) => userControlledTeamIdsForRanks.has(String(teamId)) ? (automaticRankMap.get(String(teamId)) || "") : "";
  const setResultTeam = (field, teamId) => {
    const rankField = field === "team_1_id" ? "team_1_rank" : "team_2_rank";
    setResult((prev)=>({ ...prev, [field]: teamId, [rankField]: autoRankForTeam(teamId) }));
  };

  const resultTeam1User = assignedUserForTeam(result.team_1_id, result.season_year);
  const resultTeam2User = assignedUserForTeam(result.team_2_id, result.season_year);
  const recruitUser = assignedUserForTeam(recruit.team_id, recruit.season_year);
  const isUserVsUser = Boolean(resultTeam1User && resultTeam2User);

  async function saveCenterResult() {
    if (!result.team_1_id || !result.team_2_id || result.team_1_score === "" || result.team_2_score === "") return setError("Select both teams and enter scores.");
    const { error } = await supabase.from("game_results").insert({
      ...result,
      season_year:Number(result.season_year),
      team_1_score:Number(result.team_1_score),
      team_2_score:Number(result.team_2_score),
      team_1_rank:n(result.team_1_rank),
      team_2_rank:n(result.team_2_rank),
      team_1_user_id: resultTeam1User?.id || null,
      team_2_user_id: resultTeam2User?.id || null,
      tags:[isUserVsUser ? "User vs User" : "CPU Game"],
    });
    if (error) return setError(error.message);
    setResult({ season_year: currentYear, week: currentWeek, team_1_id:"", team_2_id:"", team_1_score:"", team_2_score:"", team_1_rank:"", team_2_rank:"" });
    setError("Result saved.");
    await loadData();
  }

  async function saveCenterRecruit() {
    if (!recruit.team_id || !recruit.rank) return setError("Select team and rank.");
    const { error } = await supabase.from("recruiting_classes").insert({ ...recruit, season_year:Number(recruit.season_year), rank:Number(recruit.rank), five_stars:n(recruit.five_stars)||0, four_stars:n(recruit.four_stars)||0, three_stars:n(recruit.three_stars)||0, two_stars:n(recruit.two_stars)||0, one_stars:n(recruit.one_stars)||0 });
    if (error) return setError(error.message);
    setError(`Recruiting class saved${recruitUser ? ` for ${recruitUser.discord_username}` : ""}.`);
    await loadData();
  }

  async function saveCenterPlayer() {
    if (!player.player_name || !player.team_id) return setError("Enter player and team.");
    const payload = Object.fromEntries(Object.entries(player).map(([k,v])=>[k, ["season_year","games","pass_yards","pass_tds","interceptions","rush_yards","rush_tds","receptions","rec_yards","rec_tds","tackles","sacks","interceptions_def","forced_fumbles","fumble_recoveries"].includes(k) ? n(v) : (v || null)]));
    payload.season_year = Number(player.season_year);
    const { error } = await supabase.from("season_player_stats").insert(payload);
    if (error) return setError(error.message);
    setError("Player stats saved.");
    await loadData();
  }

  async function saveCenterTeamStat() {
    if (!teamStat.team_id) return setError("Select team.");
    const payload = Object.fromEntries(Object.entries(teamStat).map(([k,v])=>[k, k==="season_year" ? Number(v) : (["points_per_game","avg_yards_per_game","avg_pass_yards_per_game","avg_rush_yards_per_game","avg_total_yards_allowed","total_ppg_allowed","avg_rush_yards_allowed","avg_pass_yards_allowed","sacks","tfls","turnovers","takeaways","turnover_margin"].includes(k) ? n(v) : (v || null))]));
    const { error } = await supabase.from("team_season_stats").insert(payload);
    if (error) return setError(error.message);
    setError("Team stats saved.");
    await loadData();
  }

  async function saveCenterAward() {
    if (!award.player_name || !award.team_id) return setError("Enter award player and team.");
    const { error } = await supabase.from("awards").insert({ ...award, season_year:Number(award.season_year) });
    if (error) return setError(error.message);
    setError("Award saved.");
    await loadData();
  }

  async function saveCenterAa() {
    if (!aa.player_name || !aa.team_id) return setError("Enter All-American player and team.");
    const { error } = await supabase.from("all_americans").insert({ ...aa, season_year:Number(aa.season_year) });
    if (error) return setError(error.message);
    setError("All-American saved.");
    await loadData();
  }

  const tabs = [["results","Results"],["recruiting","Recruiting"],["player","Player Stats"],["team","Team Stats"],["awards","Awards"],["aa","All-Americans"]];

  return (
    <section style={broadcastPageCard}>
      <h2 style={sectionTitle}>League Data Center</h2>
      <p style={mutedText}>One clean hub for league data entry. Discord users auto-populate from active team assignments. Unassigned opponents are treated as CPU.</p>
      <div style={dataCenterTabs}>{tabs.map(([key,label])=><button key={key} style={{...dataCenterTab, borderColor: activeForm===key ? "#facc15" : "rgba(255,255,255,.16)"}} onClick={()=>setActiveForm(key)}>{label}</button>)}</div>

      {activeForm === "results" && <div style={entryPanel}><h3 style={miniTitle}>Results</h3><div style={entryGrid}>
        <select style={input} value={result.season_year} onChange={(e)=>{ const nextYear=e.target.value; const yearResults=(results || []).filter((row)=>String(row.season_year)===String(nextYear)); const userTeamIds=new Set(assignments.filter((a)=>a.status==="Active" && a.discord_user_id && a.team_id).map((a)=>String(a.team_id))); const rankRows=computerRankingRows(teams, yearResults, assignments, users).filter((row)=>userTeamIds.has(String(row.team?.id))); const rankMap=new Map(rankRows.map((row)=>[String(row.team?.id), row.rank])); setResult({...result, season_year:nextYear, team_1_rank: userTeamIds.has(String(result.team_1_id)) ? (rankMap.get(String(result.team_1_id)) || "") : "", team_2_rank: userTeamIds.has(String(result.team_2_id)) ? (rankMap.get(String(result.team_2_id)) || "") : ""}); }}>{YEARS.map((year)=><option key={year}>{year}</option>)}</select>
        <select style={input} value={result.week} onChange={(e)=>setResult({...result, week:e.target.value})}>{WEEKS.map((week)=><option key={week}>{week}</option>)}</select>
        <select style={input} value={result.team_1_id} onChange={(e)=>setResultTeam("team_1_id", e.target.value)}><option value="">Team 1</option>{teams.map((team)=><option key={team.id} value={team.id}>{team.name}</option>)}</select>
        <div style={autoUserBox}>Discord User: <b>{resultTeam1User?.discord_username || "CPU / Unassigned"}</b></div>
        <input style={input} placeholder="Team 1 Score" value={result.team_1_score} onChange={(e)=>setResult({...result, team_1_score:e.target.value})}/>
        <select style={input} value={result.team_2_id} onChange={(e)=>setResultTeam("team_2_id", e.target.value)}><option value="">Team 2 / CPU</option>{teams.map((team)=><option key={team.id} value={team.id}>{team.name}</option>)}</select>
        <div style={autoUserBox}>Discord User: <b>{resultTeam2User?.discord_username || "CPU / Unassigned"}</b></div>
        <input style={input} placeholder="Team 2 Score" value={result.team_2_score} onChange={(e)=>setResult({...result, team_2_score:e.target.value})}/>
        <input style={input} placeholder="Team 1 Rank auto from rankings" value={result.team_1_rank} onChange={(e)=>setResult({...result, team_1_rank:e.target.value})}/>
        <input style={input} placeholder="Team 2 Rank auto from rankings" value={result.team_2_rank} onChange={(e)=>setResult({...result, team_2_rank:e.target.value})}/>
      </div><div style={autoUserBox}>Game Type: <b>{isUserVsUser ? "User vs User" : "CPU Game"}</b></div><button style={button} onClick={saveCenterResult}>Save Result</button></div>}

      {activeForm === "recruiting" && <div style={entryPanel}><h3 style={miniTitle}>Recruiting</h3><div style={entryGrid}>
        <select style={input} value={recruit.team_id} onChange={(e)=>setRecruit({...recruit, team_id:e.target.value})}><option value="">Team</option>{teams.map((team)=><option key={team.id} value={team.id}>{team.name}</option>)}</select>
        <div style={autoUserBox}>Discord User: <b>{recruitUser?.discord_username || "CPU / Unassigned"}</b></div>
        <select style={input} value={recruit.season_year} onChange={(e)=>setRecruit({...recruit, season_year:e.target.value})}>{YEARS.map((year)=><option key={year}>{year}</option>)}</select>
        {["rank","five_stars","four_stars","three_stars","two_stars","one_stars"].map((field)=><input key={field} style={input} placeholder={field.replaceAll("_"," ")} value={recruit[field]} onChange={(e)=>setRecruit({...recruit,[field]:e.target.value})}/>)}
      </div><button style={button} onClick={saveCenterRecruit}>Save Recruiting</button></div>}

      {activeForm === "player" && <div style={entryPanel}><h3 style={miniTitle}>Player Stats</h3><div style={entryGrid}>
        <input style={input} placeholder="Player Name" value={player.player_name} onChange={(e)=>setPlayer({...player, player_name:e.target.value})}/>
        <select style={input} value={player.discord_user_id} onChange={(e)=>setPlayer({...player, discord_user_id:e.target.value})}><option value="">Discord User</option>{users.map((user)=><option key={user.id} value={user.id}>{user.discord_username}</option>)}</select>
        <select style={input} value={player.team_id} onChange={(e)=>setPlayer({...player, team_id:e.target.value})}><option value="">Team</option>{teams.map((team)=><option key={team.id} value={team.id}>{team.name}</option>)}</select>
        <select style={input} value={player.position} onChange={(e)=>setPlayer({...player, position:e.target.value})}>{POSITIONS.filter((p)=>p!=="Coach").map((pos)=><option key={pos}>{pos}</option>)}</select>
        <select style={input} value={player.season_year} onChange={(e)=>setPlayer({...player, season_year:e.target.value})}>{YEARS.map((year)=><option key={year}>{year}</option>)}</select>
        {["games","pass_yards","pass_tds","interceptions","rush_yards","rush_tds","receptions","rec_yards","rec_tds","tackles","sacks","interceptions_def","forced_fumbles","fumble_recoveries"].map((field)=><input key={field} style={input} placeholder={field.replaceAll("_"," ")} value={player[field]} onChange={(e)=>setPlayer({...player,[field]:e.target.value})}/>)}
      </div><button style={button} onClick={saveCenterPlayer}>Save Player Stats</button></div>}

      {activeForm === "team" && <div style={entryPanel}><h3 style={miniTitle}>Team Stats</h3><div style={entryGrid}>
        <select style={input} value={teamStat.team_id} onChange={(e)=>setTeamStat({...teamStat, team_id:e.target.value, discord_user_id: assignedUserForTeam(e.target.value, teamStat.season_year)?.id || ""})}><option value="">Team</option>{teams.map((team)=><option key={team.id} value={team.id}>{team.name}</option>)}</select>
        <select style={input} value={teamStat.discord_user_id} onChange={(e)=>setTeamStat({...teamStat, discord_user_id:e.target.value})}><option value="">Discord User</option>{users.map((user)=><option key={user.id} value={user.id}>{user.discord_username}</option>)}</select>
        <select style={input} value={teamStat.season_year} onChange={(e)=>setTeamStat({...teamStat, season_year:e.target.value})}>{YEARS.map((year)=><option key={year}>{year}</option>)}</select>
        {["points_per_game","avg_yards_per_game","avg_pass_yards_per_game","avg_rush_yards_per_game","avg_total_yards_allowed","total_ppg_allowed","avg_rush_yards_allowed","avg_pass_yards_allowed","sacks","tfls","turnovers","takeaways","turnover_margin"].map((field)=><input key={field} style={input} placeholder={field.replaceAll("_"," ")} value={teamStat[field]} onChange={(e)=>setTeamStat({...teamStat,[field]:e.target.value})}/>)}
      </div><button style={button} onClick={saveCenterTeamStat}>Save Team Stats</button></div>}

      {activeForm === "awards" && <div style={entryPanel}><h3 style={miniTitle}>Awards</h3><div style={entryGrid}>
        <input style={input} placeholder="Player Name" value={award.player_name} onChange={(e)=>setAward({...award, player_name:e.target.value})}/>
        <select style={input} value={award.team_id} onChange={(e)=>setAward({...award, team_id:e.target.value})}><option value="">Team</option>{teams.map((team)=><option key={team.id} value={team.id}>{team.name}</option>)}</select>
        <select style={input} value={award.position} onChange={(e)=>setAward({...award, position:e.target.value})}>{POSITIONS.filter((p)=>p!=="Coach").map((pos)=><option key={pos}>{pos}</option>)}</select>
        <select style={input} value={award.award_name} onChange={(e)=>setAward({...award, award_name:e.target.value})}>{AWARD_NAMES.map((name)=><option key={name}>{name}</option>)}</select>
        <select style={input} value={award.season_year} onChange={(e)=>setAward({...award, season_year:e.target.value})}>{YEARS.map((year)=><option key={year}>{year}</option>)}</select>
      </div><button style={button} onClick={saveCenterAward}>Save Award</button></div>}

      {activeForm === "aa" && <div style={entryPanel}><h3 style={miniTitle}>All-Americans</h3><div style={entryGrid}>
        <input style={input} placeholder="Player Name" value={aa.player_name} onChange={(e)=>setAa({...aa, player_name:e.target.value})}/>
        <select style={input} value={aa.team_id} onChange={(e)=>setAa({...aa, team_id:e.target.value})}><option value="">Team</option>{teams.map((team)=><option key={team.id} value={team.id}>{team.name}</option>)}</select>
        <select style={input} value={aa.position} onChange={(e)=>setAa({...aa, position:e.target.value})}>{POSITIONS.filter((p)=>p!=="Coach").map((pos)=><option key={pos}>{pos}</option>)}</select>
        <select style={input} value={aa.type} onChange={(e)=>setAa({...aa, type:e.target.value})}><option>First-Team</option><option>Second-Team</option><option>Freshman</option></select>
        <select style={input} value={aa.season_year} onChange={(e)=>setAa({...aa, season_year:e.target.value})}>{YEARS.map((year)=><option key={year}>{year}</option>)}</select>
      </div><button style={button} onClick={saveCenterAa}>Save All-American</button></div>}
    </section>
  );
}

function SeasonStatsPage({ rows, teams, users, updateRow, deleteRow }) {
  const [searchText, setSearchText] = useState("");
  const [sortState, setSortState] = useState({ key: "season_year", direction: "desc" });
  const filtered = rows.filter((row) => {
    const haystack = [
      row.player_name,
      row.position,
      row.teams?.name || teamNameById(row.team_id, teams),
      row.discord_users?.discord_username,
      row.season_year,
    ].join(" ").toLowerCase();
    return !searchText || haystack.includes(searchText.toLowerCase());
  });
  const keyGetters = {
    season_year: (r)=>r.season_year,
    player_name: (r)=>r.player_name,
    position: (r)=>r.position,
    discord: (r)=>r.discord_users?.discord_username || users.find((user)=>user.id===r.discord_user_id)?.discord_username || "",
    team: (r)=>r.teams?.name || teamNameById(r.team_id, teams),
    games: (r)=>r.games,
    pass_yards: (r)=>r.pass_yards,
    pass_tds: (r)=>r.pass_tds,
    interceptions: (r)=>r.interceptions,
    rush_yards: (r)=>r.rush_yards,
    rush_tds: (r)=>r.rush_tds,
    receptions: (r)=>r.receptions,
    rec_yards: (r)=>r.rec_yards,
    rec_tds: (r)=>r.rec_tds,
    tackles: (r)=>r.tackles,
    sacks: (r)=>r.sacks,
    interceptions_def: (r)=>r.interceptions_def,
    forced_fumbles: (r)=>r.forced_fumbles,
    fumble_recoveries: (r)=>r.fumble_recoveries,
  };
  const sorted = sortRows(filtered, sortState, keyGetters);
  const H = (label,key)=><SortHeader label={label} sortKey={key} sortState={sortState} setSortState={setSortState}/>;

  return (
    <section style={broadcastCard}>
      <div style={sectionTop}>
        <div>
          <h2 style={sectionTitle}>Season Player Stats</h2>
          <p style={mutedText}>Sortable ESPN-style season stat tracker for awards, records, and Hall of Fame context.</p>
        </div>
        <SearchBox value={searchText} onChange={setSearchText}/>
      </div>

      <Table headers={[H("Year","season_year"),H("Player","player_name"),H("Pos","position"),H("Discord User","discord"),H("Team","team"),H("G","games"),H("Pass Yds","pass_yards"),H("Pass TD","pass_tds"),H("INT","interceptions"),H("Rush Yds","rush_yards"),H("Rush TD","rush_tds"),H("Rec","receptions"),H("Rec Yds","rec_yards"),H("Rec TD","rec_tds"),H("Tkl","tackles"),H("Sack","sacks"),H("DEF INT","interceptions_def"),H("FF","forced_fumbles"),H("FR","fumble_recoveries"),""]}>
        {sorted.map((row) => (
          <tr key={row.id} style={trStyle}>
            <td style={td}>{row.season_year}</td>
            <td style={td}>{row.player_name}</td>
            <td style={td}>{row.position}</td>
            <td style={td}>{row.discord_users?.discord_username || users.find((user)=>user.id===row.discord_user_id)?.discord_username || "—"}</td>
            <td style={teamCell}><TeamLabel team={row.teams || teams.find((team)=>team.id===row.team_id)} /></td>
            <td style={td}>{row.games ?? "—"}</td>
            <td style={td}>{row.pass_yards ?? "—"}</td>
            <td style={td}>{row.pass_tds ?? "—"}</td>
            <td style={td}>{row.interceptions ?? "—"}</td>
            <td style={td}>{row.rush_yards ?? "—"}</td>
            <td style={td}>{row.rush_tds ?? "—"}</td>
            <td style={td}>{row.receptions ?? "—"}</td>
            <td style={td}>{row.rec_yards ?? "—"}</td>
            <td style={td}>{row.rec_tds ?? "—"}</td>
            <td style={td}>{row.tackles ?? "—"}</td>
            <td style={td}>{row.sacks ?? "—"}</td>
            <td style={td}>{row.interceptions_def ?? "—"}</td>
            <td style={td}>{row.forced_fumbles ?? "—"}</td>
            <td style={td}>{row.fumble_recoveries ?? "—"}</td>
            <td style={td}><DeleteButton onClick={()=>deleteRow("season_player_stats", row.id)}/></td>
          </tr>
        ))}
      </Table>
    </section>
  );
}

function TeamStatsPage({ rows, teams, users, deleteRow }) {
  const [searchText, setSearchText] = useState("");
  const [sortState, setSortState] = useState({ key: "season_year", direction: "desc" });
  const filtered = rows.filter((row) => {
    const haystack = [
      row.teams?.name || teamNameById(row.team_id, teams),
      row.discord_users?.discord_username,
      row.season_year,
    ].join(" ").toLowerCase();
    return !searchText || haystack.includes(searchText.toLowerCase());
  });
  const keyGetters = {
    season_year: (r)=>r.season_year,
    team: (r)=>r.teams?.name || teamNameById(r.team_id, teams),
    discord: (r)=>r.discord_users?.discord_username || users.find((user)=>user.id===r.discord_user_id)?.discord_username || "",
    points_per_game: (r)=>r.points_per_game,
    avg_yards_per_game: (r)=>r.avg_yards_per_game ?? r.total_offense,
    avg_pass_yards_per_game: (r)=>r.avg_pass_yards_per_game ?? r.pass_yards,
    avg_rush_yards_per_game: (r)=>r.avg_rush_yards_per_game ?? r.rush_yards,
    avg_total_yards_allowed: (r)=>r.avg_total_yards_allowed,
    total_ppg_allowed: (r)=>r.total_ppg_allowed,
    avg_rush_yards_allowed: (r)=>r.avg_rush_yards_allowed,
    avg_pass_yards_allowed: (r)=>r.avg_pass_yards_allowed,
    sacks: (r)=>r.sacks,
    tfls: (r)=>r.tfls,
    turnovers: (r)=>r.turnovers,
    takeaways: (r)=>r.takeaways,
    turnover_margin: (r)=>r.turnover_margin,
  };
  const sorted = sortRows(filtered, sortState, keyGetters);
  const H = (label,key)=><SortHeader label={label} sortKey={key} sortState={sortState} setSortState={setSortState}/>;

  return (
    <section style={broadcastPageCard}>
      <div style={sectionTop}>
        <div>
          <h2 style={sectionTitle}>Team Season Stats</h2>
          <p style={mutedText}>Sortable offense, defense, TFLs, turnovers, and takeaways by season.</p>
        </div>
        <SearchBox value={searchText} onChange={setSearchText}/>
      </div>

      <Table headers={[H("Year","season_year"),H("Team","team"),H("Discord User","discord"),H("PPG","points_per_game"),H("Avg YPG","avg_yards_per_game"),H("Avg Pass YPG","avg_pass_yards_per_game"),H("Avg Rush YPG","avg_rush_yards_per_game"),H("Avg Yds Allowed","avg_total_yards_allowed"),H("Total PPG Allowed","total_ppg_allowed"),H("Avg Rush Allowed","avg_rush_yards_allowed"),H("Avg Pass Allowed","avg_pass_yards_allowed"),H("Sacks","sacks"),H("TFL","tfls"),H("TO","turnovers"),H("Takeaways","takeaways"),H("TO Margin","turnover_margin"),""]}>
        {sorted.map((row) => (
          <tr key={row.id} style={trStyle}>
            <td style={td}>{row.season_year}</td>
            <td style={teamCell}><TeamLabel team={row.teams || teams.find((team)=>team.id===row.team_id)} /></td>
            <td style={td}>{row.discord_users?.discord_username || users.find((user)=>user.id===row.discord_user_id)?.discord_username || "—"}</td>
            <td style={td}>{row.points_per_game ?? "—"}</td>
            <td style={td}>{row.avg_yards_per_game ?? row.total_offense ?? "—"}</td>
            <td style={td}>{row.avg_pass_yards_per_game ?? row.pass_yards ?? "—"}</td>
            <td style={td}>{row.avg_rush_yards_per_game ?? row.rush_yards ?? "—"}</td>
            <td style={td}>{row.avg_total_yards_allowed ?? "—"}</td>
            <td style={td}>{row.total_ppg_allowed ?? "—"}</td>
            <td style={td}>{row.avg_rush_yards_allowed ?? "—"}</td>
            <td style={td}>{row.avg_pass_yards_allowed ?? "—"}</td>
            <td style={td}>{row.sacks ?? "—"}</td>
            <td style={td}>{row.tfls ?? "—"}</td>
            <td style={td}>{row.turnovers ?? "—"}</td>
            <td style={td}>{row.takeaways ?? "—"}</td>
            <td style={td}>{row.turnover_margin ?? "—"}</td>
            <td style={td}><DeleteButton onClick={()=>deleteRow("team_season_stats", row.id)}/></td>
          </tr>
        ))}
      </Table>
    </section>
  );
}

function ResultsManager({ rows, teams, users, assignments, updateRow, deleteRow }) {
  const [searchText, setSearchText] = useState("");
  const filtered = rows
    .filter((row)=>{
      const haystack = [
        row.season_year,
        row.week,
        row.team_1?.name || teamNameById(row.team_1_id, teams),
        row.team_2?.name || teamNameById(row.team_2_id, teams),
        row.user_1?.discord_username,
        row.user_2?.discord_username,
      ].join(" ").toLowerCase();
      return !searchText || haystack.includes(searchText.toLowerCase());
    })
    .sort((a,b)=>Number(b.season_year||0)-Number(a.season_year||0) || weekIndex(b.week)-weekIndex(a.week));

  async function deleteResultRow(id) {
    if (!window.confirm("Delete this game result? This cannot be undone.")) return;
    await deleteRow("game_results", id);
  }

  return (
    <section style={card}>
      <div style={sectionTop}>
        <div>
          <h2 style={sectionTitle}>Results Manager</h2>
          <p style={mutedText}>Edit or delete saved game results from one place.</p>
        </div>
        <SearchBox value={searchText} onChange={setSearchText}/>
      </div>

      <div style={mobileList}>
        {filtered.map((row)=>(
          <div key={row.id} style={managerCard}>
            <div style={leaderRow}>
              <b>{row.season_year} · {row.week}</b>
              <span>{row.team_1?.name || teamNameById(row.team_1_id, teams)} {row.team_1_score}-{row.team_2_score} {row.team_2?.name || teamNameById(row.team_2_id, teams)}</span>
            </div>

            <div style={filterGrid}>
              <select style={input} value={row.season_year || ""} onChange={(e)=>updateRow("game_results", row.id, "season_year", e.target.value)}>
                {YEARS.map((year)=><option key={year}>{year}</option>)}
              </select>
              <select style={input} value={row.week || ""} onChange={(e)=>updateRow("game_results", row.id, "week", e.target.value)}>
                {WEEKS.map((week)=><option key={week}>{week}</option>)}
              </select>
              <select style={input} value={row.team_1_id || ""} onChange={(e)=>updateRow("game_results", row.id, "team_1_id", e.target.value)}>
                {teams.map((team)=><option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
              <input style={input} value={row.team_1_score ?? ""} onChange={(e)=>updateRow("game_results", row.id, "team_1_score", e.target.value)} placeholder="Team 1 Score"/>
              <select style={input} value={row.team_2_id || ""} onChange={(e)=>updateRow("game_results", row.id, "team_2_id", e.target.value)}>
                {teams.map((team)=><option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
              <input style={input} value={row.team_2_score ?? ""} onChange={(e)=>updateRow("game_results", row.id, "team_2_score", e.target.value)} placeholder="Team 2 Score"/>
              <input style={input} value={row.team_1_rank ?? ""} onChange={(e)=>updateRow("game_results", row.id, "team_1_rank", e.target.value)} placeholder="Team 1 Rank"/>
              <input style={input} value={row.team_2_rank ?? ""} onChange={(e)=>updateRow("game_results", row.id, "team_2_rank", e.target.value)} placeholder="Team 2 Rank"/>
              <button style={dangerButton} onClick={()=>deleteResultRow(row.id)}>Delete Result</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RecruitingRankings({ rows, teams, users, assignments, currentYear, loadData, deleteRow, updateRow }) {
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
    else {
      setDraft({ team_id: "", season_year: currentYear, rank: "" });
      if (loadData) await loadData();
    }
  }

  async function deleteRecruiting(id) {
    if (!window.confirm("Delete this recruiting class entry?")) return;
    if (deleteRow) await deleteRow("recruiting_classes", id);
  }

  return (
    <section style={card}>
      <h2 style={sectionTitle}>Recruiting Class Rankings</h2>
      <p style={mutedText}>Add class ranks here and they automatically translate to team pages, coach profiles, and conference power.</p>

      <div style={miniCard}>
        <h3 style={miniTitle}>Add Recruiting Class</h3>
        <div style={filterGrid}>
          <select style={input} value={draft.team_id} onChange={(e)=>setDraft({...draft, team_id:e.target.value})}>
            <option value="">Select Team</option>
            {teams.map((team)=><option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
          <select style={input} value={draft.season_year} onChange={(e)=>setDraft({...draft, season_year:e.target.value})}>
            {YEARS.map((year)=><option key={year}>{year}</option>)}
          </select>
          <input style={input} value={draft.rank} onChange={(e)=>setDraft({...draft, rank:e.target.value})} placeholder="Class Rank"/>
          <button style={button} onClick={addRecruitingClass}>Add Class</button>
        </div>
      </div>

      <div style={twoCol}>
        <div style={miniCard}>
          <h3 style={miniTitle}>{currentYear} Rankings</h3>
          <div style={mobileList}>
            {yearRows.length ? yearRows.slice(0,50).map((row)=>(
              <div key={row.id} style={managerCard}>
                <div style={leaderRow}><b>#{row.rank}</b><span>{row.teams?.name || teamNameById(row.team_id, teams)}</span></div>
                <div style={filterGrid}>
                  <input style={input} value={row.rank || ""} onChange={(e)=>updateRow?.("recruiting_classes", row.id, "rank", e.target.value)} placeholder="Rank"/>
                  <select style={input} value={row.season_year || currentYear} onChange={(e)=>updateRow?.("recruiting_classes", row.id, "season_year", e.target.value)}>
                    {YEARS.map((year)=><option key={year}>{year}</option>)}
                  </select>
                  <button style={dangerButton} onClick={()=>deleteRecruiting(row.id)}>Delete</button>
                </div>
              </div>
            )) : <div style={miniRow}>No recruiting data for {currentYear} yet.</div>}
          </div>
        </div>

        <div style={miniCard}>
          <h3 style={miniTitle}>Best Classes Logged</h3>
          {bestByCoach.length ? bestByCoach.map((row)=>(
            <div key={row.id} style={leaderRow}>
              <span>#{row.rank} {row.teams?.name || teamNameById(row.team_id, teams)} · {row.season_year}</span>
              <b>{row.coach}</b>
            </div>
          )) : <div style={miniRow}>No recruiting data yet.</div>}
        </div>
      </div>
    </section>
  );
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
  const safeResults = results || [];
  const base = teams.map((team) => {
    const rec = recordFromResults(team.id, safeResults);
    const games = rec.games || 0;
    const winPct = games ? rec.wins / games : 0;
    const avgPf = Number(rec.avgPf);
    const avgPa = Number(rec.avgPa);
    const sor = Number(strengthOfResult(team.id, teams, safeResults)) || 0;
    const top10 = top10Wins(team.id, safeResults);
    const top25 = top25Wins(team.id, safeResults);
    const qw = qualityWins(team.id, safeResults);
    const margin = avgPf - avgPa;
    const offenseScore = Math.max(0, Math.min(18, avgPf * 0.22));
    const defenseScore = Math.max(0, Math.min(18, (38 - avgPa) * 0.28));
    const marginScore = Math.max(-8, Math.min(14, margin * 0.32));
    const userTierScore = opponentUserTierScore(team.id, safeResults, assignments, users);
    const lossPenalty = rec.losses * 4.2;
    const winsScore = rec.wins * 2.1;
    const winPctScore = winPct * 34;
    const sorScore = sor * 3.15;
    const top10Score = top10 * 8.5;
    const top25Score = Math.max(0, top25 - top10) * 4.25;
    const qualityWinScore = qw * 3.75;
    const userDifficultyScore = userTierScore * 0.28;
    const gameVolumeBonus = Math.min(6, games * 0.55);

    const raw =
      winPctScore +
      winsScore +
      sorScore +
      top10Score +
      top25Score +
      qualityWinScore +
      offenseScore +
      defenseScore +
      marginScore +
      userDifficultyScore +
      gameVolumeBonus -
      lossPenalty;

    const rating = Number(Math.max(0, raw).toFixed(1));

    return {
      team,
      teamName: team.name,
      wins: rec.wins,
      losses: rec.losses,
      games,
      avgPf,
      avgPa,
      top10,
      top25,
      qw,
      sor,
      winPct: Number((winPct * 100).toFixed(1)),
      userTierScore: Number(userTierScore.toFixed(1)),
      rating,
      score: rating,
      formulaParts: {
        winPctScore: Number(winPctScore.toFixed(1)),
        sorScore: Number(sorScore.toFixed(1)),
        top10Score: Number(top10Score.toFixed(1)),
        top25Score: Number(top25Score.toFixed(1)),
        offenseScore: Number(offenseScore.toFixed(1)),
        defenseScore: Number(defenseScore.toFixed(1)),
        lossPenalty: Number(lossPenalty.toFixed(1)),
      },
    };
  });
  return base
    .sort((a,b)=>b.rating-a.rating || b.wins-a.wins || a.losses-b.losses || b.sor-a.sor || a.teamName.localeCompare(b.teamName))
    .map((row,index)=>({...row, rank:index+1}));
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


function coachSuperlatives(user, users, teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting) {
  const rows = getCoachStats(users, teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting);
  const current = rows.find((row)=>row.userId === user.id);
  if (!current) return [];

  const sortedBy = (key) => [...rows].filter((row)=>Number(row[key]||0)>0).sort((a,b)=>Number(b[key]||0)-Number(a[key]||0));
  const badges = [];

  if (current.nattys >= 3) badges.push("🏆 Dynasty Legend");
  else if (current.nattys >= 1) badges.push("🏆 National Champion");

  if (sortedBy("top10Wins")[0]?.userId === user.id) badges.push("🎯 Big Game Hunter");
  if (sortedBy("confTitles")[0]?.userId === user.id) badges.push("👑 Conference King");
  if (sortedBy("top25Classes")[0]?.userId === user.id) badges.push("🧲 Elite Recruiter");
  if (sortedBy("allAmericans")[0]?.userId === user.id) badges.push("⭐ Talent Developer");
  if (sortedBy("awards")[0]?.userId === user.id) badges.push("🏅 Trophy Collector");
  if (sortedBy("heismans")[0]?.userId === user.id) badges.push("🎖 Heisman Coach");

  if (!badges.length && current.wins > 0) badges.push("📈 Program Builder");
  return badges.slice(0, 6);
}

function CoachRings({ stats, superlatives }) {
  const rings = [
    { label: "National Championships", icon: "🏆", value: stats?.nattys || 0 },
    { label: "Conference Championships", icon: "💍", value: stats?.confTitles || 0 },
    { label: "Heisman Winners", icon: "🎖️", value: stats?.heismans || 0 },
    { label: "Top 10 Wins", icon: "🎯", value: stats?.top10Wins || 0 },
  ];

  return (
    <div style={coachRingsPanel}>
      <div style={coachRingGrid}>
        {rings.map((ring)=>(
          <div key={ring.label} style={coachRingTile}>
            <div style={coachRingIcons}>{ring.value > 0 ? Array.from({length: Math.min(Number(ring.value), 6)}, (_,i)=><span key={i}>{ring.icon}</span>) : <span>—</span>}</div>
            <div style={coachRingValue}>{ring.value}</div>
            <div style={statTitle}>{ring.label}</div>
          </div>
        ))}
      </div>
      <div style={superlativeRow}>
        {(superlatives?.length ? superlatives : ["Building résumé"]).map((badge)=>(
          <span key={badge} style={superlativePill}>{badge}</span>
        ))}
      </div>
    </div>
  );
}



const fullTable = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  color: "#f8fafc",
  minWidth: 920,
};

function SortableStatsTable({ title, rows = [], columns = [], emptyText = "No records yet." }) {
  const [sortConfig, setSortConfig] = useState({ key: columns[0]?.key || "", direction: "desc" });

  const sortedRows = [...rows].sort((a,b)=>{
    const av = a?.[sortConfig.key];
    const bv = b?.[sortConfig.key];
    const an = Number(av);
    const bn = Number(bv);
    if (!Number.isNaN(an) && !Number.isNaN(bn)) {
      return sortConfig.direction === "asc" ? an - bn : bn - an;
    }
    const cmp = String(av ?? "").localeCompare(String(bv ?? ""));
    return sortConfig.direction === "asc" ? cmp : -cmp;
  });

  function toggleSort(key) {
    setSortConfig((prev)=>({ key, direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc" }));
  }

  return (
    <section style={coachFullWidthTableV41}>
      <div style={sectionTop}>
        <h3 style={miniTitle}>{title}</h3>
        <span style={mutedText}>{rows.length} records</span>
      </div>
      <div style={coachStatsTableWrapV41}>
        <table style={fullTable}>
          <thead>
            <tr>
              {columns.map((column)=>(
                <th key={column.key}>
                  <button type="button" style={tableSortButtonV41} onClick={()=>toggleSort(column.key)}>
                    {column.label}{sortConfig.key === column.key ? (sortConfig.direction === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length ? sortedRows.map((row, index)=>(
              <tr key={row.id || `${title}-${index}`}>
                {columns.map((column)=><td key={column.key}>{row[column.key] ?? "—"}</td>)}
              </tr>
            )) : (
              <tr><td colSpan={columns.length}><div style={tableEmptyStateV43}>{emptyText}<br/><small>Use League Data Center → Team Stats / Player Stats to record this data.</small></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CoachProfile({ user, users = [], teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting, seasonPlayerStats = [], teamSeasonStats = [] }) {
  const safeUser = user || {};
  const coachStats = getCoachStats(usersFallback(safeUser), teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting);
  const stats = coachStats.find((row)=>row.userId === safeUser.id) || { wins:0, losses:0, nattys:0, confTitles:0, top10Wins:0, top25Wins:0, awards:0, allAmericans:0, heismans:0, prestige:0 };
  const activeAssignment = assignments.find((a)=>a.discord_user_id===safeUser.id && a.status==="Active");
  const currentTeam = teams.find((t)=>t.id===activeAssignment?.team_id) || activeAssignment?.teams || null;
  const primary = getTeamPrimary(currentTeam);
  const secondary = getTeamSecondary(currentTeam);
  const timeline = assignments.filter((a)=>a.discord_user_id===safeUser.id).sort((a,b)=>Number(a.start_year||0)-Number(b.start_year||0));
  const coachResults = results.filter((result) => {
    const team1UserId = result.team_1_user_id || coachForTeamYear(result.team_1_id, result.season_year, assignments)?.discord_user_id;
    const team2UserId = result.team_2_user_id || coachForTeamYear(result.team_2_id, result.season_year, assignments)?.discord_user_id;
    return team1UserId === safeUser.id || team2UserId === safeUser.id;
  });
  const coachAA = rowsForCoachUser(allAmericans, safeUser, assignments);
  const coachAwards = rowsForCoachUser(awards, safeUser, assignments);
  const coachHeismans = rowsForCoachUser(heismans, safeUser, assignments);
  const coachPlayerStats = (seasonPlayerStats || []).filter((row)=>{
    if (row.discord_user_id === safeUser.id) return true;
    return coachForTeamYear(row.team_id, row.season_year, assignments)?.discord_user_id === safeUser.id;
  });
  const coachTeamStats = (teamSeasonStats || []).filter((row)=>{
    if (row.discord_user_id === safeUser.id) return true;
    return coachForTeamYear(row.team_id, row.season_year, assignments)?.discord_user_id === safeUser.id;
  });
  const coachRecruiting = (recruiting || []).filter((row)=>coachForTeamYear(row.team_id, row.season_year, assignments)?.discord_user_id === safeUser.id).sort((a,b)=>Number(b.season_year)-Number(a.season_year));
  const coachPrestigeScore = Math.min(100, Math.round((stats?.prestige || stats?.rawPrestige || stats?.totalScore || 0) / 2.5));
  const coachPrestigeTier = typeof dynastyPrestigeTier === "function" ? dynastyPrestigeTier(coachPrestigeScore) : { stars: "⭐", label: "1-Star Coach" };
  const hofPct = Math.min(100, Math.max(0, coachPrestigeScore));

  const coachTeamStatRows = coachTeamStats.map((row)=>({
    id: row.id,
    year: row.season_year,
    team: teamNameById(row.team_id, teams),
    ppg: row.points_per_game,
    ypg: row.avg_yards_per_game,
    passYpg: row.avg_pass_yards_per_game,
    rushYpg: row.avg_rush_yards_per_game,
    yardsAllowed: row.avg_total_yards_allowed,
    ppgAllowed: row.total_ppg_allowed,
    rushAllowed: row.avg_rush_yards_allowed,
    passAllowed: row.avg_pass_yards_allowed,
    sacks: row.sacks,
    tfls: row.tfls,
    turnovers: row.turnovers,
    takeaways: row.takeaways,
    margin: row.turnover_margin,
  }));
  const coachPlayerStatRows = coachPlayerStats.map((row)=>({
    id: row.id,
    year: row.season_year,
    player: row.player_name,
    pos: row.position,
    team: teamNameById(row.team_id, teams),
    games: row.games,
    passYards: row.pass_yards,
    passTds: row.pass_tds,
    ints: row.interceptions,
    rushYards: row.rush_yards,
    rushTds: row.rush_tds,
    rec: row.receptions,
    recYards: row.rec_yards,
    recTds: row.rec_tds,
    tackles: row.tackles,
    sacks: row.sacks,
    defInts: row.interceptions_def,
    ff: row.forced_fumbles,
    fr: row.fumble_recoveries,
  }));
  const teamStatColumns = [
    { key:"year", label:"Year" }, { key:"team", label:"Team" }, { key:"ppg", label:"PPG" }, { key:"ypg", label:"YPG" },
    { key:"passYpg", label:"Pass YPG" }, { key:"rushYpg", label:"Rush YPG" }, { key:"yardsAllowed", label:"Yds Allowed" },
    { key:"ppgAllowed", label:"PPG Allowed" }, { key:"rushAllowed", label:"Rush Allowed" }, { key:"passAllowed", label:"Pass Allowed" },
    { key:"sacks", label:"Sacks" }, { key:"tfls", label:"TFLs" }, { key:"turnovers", label:"TO" }, { key:"takeaways", label:"Takeaways" }, { key:"margin", label:"TO Margin" },
  ];
  const playerStatColumns = [
    { key:"year", label:"Year" }, { key:"player", label:"Player" }, { key:"pos", label:"Pos" }, { key:"team", label:"Team" },
    { key:"games", label:"GP" }, { key:"passYards", label:"Pass Yds" }, { key:"passTds", label:"Pass TD" }, { key:"ints", label:"INT" },
    { key:"rushYards", label:"Rush Yds" }, { key:"rushTds", label:"Rush TD" }, { key:"rec", label:"REC" }, { key:"recYards", label:"Rec Yds" },
    { key:"recTds", label:"Rec TD" }, { key:"tackles", label:"Tackles" }, { key:"sacks", label:"Sacks" }, { key:"defInts", label:"Def INT" },
    { key:"ff", label:"FF" }, { key:"fr", label:"FR" },
  ];
  const trophyRows = [
    { label:"National Championships", value:stats?.nattys||0, icon:"🏆" },
    { label:"Conference Titles", value:stats?.confTitles||0, icon:"🏅" },
    { label:"Heismans", value:stats?.heismans||0, icon:"🏈" },
    { label:"Award Winners", value:stats?.awards||0, icon:"⭐" },
    { label:"1st Team All-Americans", value:stats?.allAmericans||0, icon:"🇺🇸" },
  ];
  const milestoneRows = coachMilestonesForStats(stats);


  return (
    <section style={coachPageV43}>
      <div style={{...coachHeroV43, borderColor:`${secondary}77`, background:`linear-gradient(135deg, ${primary}e8, rgba(2,6,23,.98) 58%)`}}>
        <div style={coachHeroIdentityV43}>
          <TeamLogoMark team={currentTeam} size={72}/>
          <div>
            <div style={dashboardKickerPro}>{currentTeam?.name || "Unassigned Coach"}</div>
            <h1 style={coachNameV43}>{safeUser.discord_username || "Coach"}</h1>
            <p style={coachSubV37}>CFBElite Coach Profile</p>
          </div>
        </div>
        <div style={coachHeroMetricsV45}>
          <div style={coachHeroMetricV45}><span>Record</span><b>{stats?.wins||0}-{stats?.losses||0}</b></div>
          <div style={coachHeroMetricV45}><span>Prestige</span><b>{coachPrestigeScore}</b><small>{coachPrestigeTier.stars} {coachPrestigeTier.label}</small></div>
          <div style={coachHeroMetricV45}><span>Nattys</span><b>{stats?.nattys||0}</b></div>
          <div style={coachHeroMetricV45}><span>Conf Titles</span><b>{stats?.confTitles||0}</b></div>
        </div>
      </div>

      <section style={coachResumeStripV43}>
        <Stat title="Top 10 Wins" value={stats?.top10Wins||0}/>
        <Stat title="Top 25 Wins" value={stats?.top25Wins||0}/>
        <Stat title="Awards" value={stats?.awards||0}/>
        <Stat title="All-Americans" value={stats?.allAmericans||0}/>
        <Stat title="Heismans" value={stats?.heismans||0}/>
        <Stat title="HOF Progress" value={`${hofPct}%`}/>
      </section>

      <section style={coachTrophyCaseV46}>
        <div style={sectionTop}><h3 style={miniTitle}>Trophy Case</h3><span style={mutedText}>Career résumé display</span></div>
        <div style={coachTrophyGridV46}>
          {trophyRows.map((item)=>(
            <div key={item.label} style={coachTrophyTileV46}>
              <span>{item.icon}</span>
              <b>{item.value}</b>
              <small>{item.label}</small>
            </div>
          ))}
        </div>
      </section>

      <section style={coachTrophyCaseV46}>
        <div style={sectionTop}><h3 style={miniTitle}>Career Milestones</h3><span style={mutedText}>Auto-generated achievements</span></div>
        <div style={coachMilestoneGridV46}>
          {milestoneRows.length ? milestoneRows.map((item)=>(
            <div key={item.label} style={coachMilestoneTileV46}><span>{item.icon}</span><b>{item.label}</b></div>
          )) : <div style={tableEmptyStateV43}>No career milestones yet.<br/><small>Milestones unlock automatically as results and titles are recorded.</small></div>}
        </div>
      </section>

      <section style={coachProfileGridV43}>
        <div style={coachPanelV37}>
          <h3 style={miniTitle}>Hall of Fame Progress</h3>
          <div style={hofProgressTrack}><div style={{...hofProgressFill, width:`${hofPct}%`}} /></div>
          <div style={miniRow}>Prestige Requirement: <b>{coachPrestigeScore}/100</b></div>
          <div style={miniRow}>Titles: <b>{stats?.nattys||0} National • {stats?.confTitles||0} Conference</b></div>
          <div style={miniRow}>Major Accolades: <b>{(stats?.awards||0)+(stats?.allAmericans||0)+(stats?.heismans||0)}</b></div>
        </div>
        <div style={coachPanelV37}>
          <h3 style={miniTitle}>Recruiting History</h3>
          {coachRecruiting.length ? coachRecruiting.slice(0,8).map((row)=>(
            <div key={row.id || `${row.season_year}-${row.team_id}`} style={miniRow}>
              <span>{row.season_year} • {teamNameById(row.team_id, teams)}</span><b>#{row.rank}</b>
            </div>
          )) : <p style={mutedText}>No recruiting classes recorded yet.</p>}
        </div>
      </section>

      <SortableStatsTable title="Team Season Stats" rows={coachTeamStatRows} columns={teamStatColumns} emptyText="No team stats recorded yet."/>
      <SortableStatsTable title="Player Season Stats" rows={coachPlayerStatRows} columns={playerStatColumns} emptyText="No player stats recorded yet."/>

      <CoachTimelineTable timeline={timeline} teams={teams} results={results} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions}/>
      <Results rows={coachResults} deleteResult={()=>{}} search="" setSearch={()=>{}}/>
      <RecognitionTable title="All-Americans" headers={["Player","Position","Team","Year","Type"]} rows={coachAA.map((r)=>({id:r.id,cells:[r.player_name,r.position,teamNameById(r.team_id,teams),r.season_year,r.type]}))}/>
      <RecognitionTable title="Award Winners" headers={["Player","Position","Team","Year","Award"]} rows={coachAwards.map((r)=>({id:r.id,cells:[r.player_name,r.position,teamNameById(r.team_id,teams),r.season_year,r.award_name]}))}/>
      <RecognitionTable title="Heisman Winners" headers={["Player","Position","Team","Year"]} rows={coachHeismans.map((r)=>({id:r.id,cells:[r.player_name,r.position,teamNameById(r.team_id,teams),r.season_year]}))}/>
    </section>
  );
}

function usersFallback(user) { return [user]; }

function coachHofCriteria(row) {
  const accolades = row.heismans + row.awards + row.allAmericans;
  const winPct = row.games ? row.wins / row.games : 0;
  const estimatedSeasons = Math.max(row.teamsCoached?.size || 0, Math.ceil((row.games || 0) / 12));

  const qualifies =
    estimatedSeasons >= 10 &&
    winPct >= .700 &&
    row.rawPrestige >= 220 &&
    (
      row.nattys >= 1 ||
      row.confTitles >= 4 ||
      row.top10Wins >= 18 ||
      accolades >= 55
    );

  const reasons = [];
  if (estimatedSeasons >= 10) reasons.push("10+ Season Résumé");
  if (winPct >= .700) reasons.push("70%+ Win Percentage");
  if (row.rawPrestige >= 220) reasons.push("220+ Prestige Score");
  if (row.nattys >= 1) reasons.push("National Champion");
  if (row.confTitles >= 4) reasons.push("4+ Conference Titles");
  if (row.top10Wins >= 18) reasons.push("18+ Top 10 Wins");
  if (accolades >= 55) reasons.push("55+ Major Accolades");

  return { qualifies, reasons };
}


function DynastyHallOfFame({ users, teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting }) {
  const rows = getCoachStats(users, teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting)
    .map((row)=>({ ...row, hofScore: dynastyHallOfFameScore(row), milestones: coachMilestonesForStats(row) }))
    .sort((a,b)=>b.hofScore-a.hofScore || b.nattys-a.nattys || b.wins-a.wins);

  return (
    <section style={card}>
      <div style={sectionTop}>
        <div>
          <h2 style={sectionTitle}>CFBElite Hall of Fame</h2>
          <p style={mutedText}>All-time coach ranking powered by wins, national titles, conference titles, awards, Heismans, Top 10 wins, and prestige.</p>
        </div>
      </div>
      <div style={hofRankingGridV46}>
        {rows.map((row,index)=>(
          <div key={row.userId || row.discord || index} style={hofRankingCardV46}>
            <div style={hofRankNumberV46}>#{index+1}</div>
            <div>
              <h3>{row.discord}</h3>
              <p>{row.wins}-{row.losses} • {row.nattys} Nattys • {row.confTitles} Conf Titles</p>
            </div>
            <strong>{row.hofScore}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function CoachHallOfFame({ users, teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting }) {
  const rows = getCoachStats(users, teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting)
    .map((row)=>({ ...row, hofCriteria: coachHofCriteria(row) }))
    .filter((row)=>row.hofCriteria.qualifies && row.rawPrestige >= 180)
    .sort((a,b)=>b.rawPrestige-a.rawPrestige || b.wins-a.wins);
  return <section style={card}><h2 style={sectionTitle}>Coach Hall of Fame</h2><p style={mutedText}>Coach Hall of Fame is intentionally extremely difficult: true dynasty résumés only. Qualifiers require multiple national titles or long-term dominance with elite wins, conference titles, major accolades, and a major HOF score.</p>{rows.length ? <div style={hofGrid}>{rows.map((row)=><CoachHofCard key={row.userId || row.discord} row={row} teams={teams} assignments={assignments}/>)}</div> : <div style={miniRow}>No coaches have met Hall of Fame criteria yet.</div>}</section>;
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
    { label: "Top 10 Wins", count: row.top10Wins, points: row.top10Wins * 6 },
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

    row.score = row.heismans.length*50 + row.awards.length*20 + row.allAmericans.length*14 + row.nattys*24 + row.confTitles*8;

    if (row.heismans.length >= 2) row.reasons.push("2+ Heisman Winners");
    if (row.heismans.length >= 1 && row.awards.length >= 2 && row.allAmericans.length >= 2) row.reasons.push("Heisman + 2 Awards + 2 All-Americans");
    if (row.awards.length >= 5 && row.allAmericans.length >= 2) row.reasons.push("5+ Major Awards with All-American Résumé");
    if (row.allAmericans.length >= 6 && row.awards.length >= 2) row.reasons.push("6+ All-American Selections");
    if (row.nattys >= 2 && (row.heismans.length >= 1 || row.awards.length >= 3 || row.allAmericans.length >= 5)) row.reasons.push("Multi-title era cornerstone");
    if (row.score >= 150) row.reasons.push("125+ HOF Score");
  });

  return [...map.values()]
    .filter((r)=>
      r.heismans.length >= 2 ||
      (r.heismans.length >= 1 && r.awards.length >= 2 && r.allAmericans.length >= 2) ||
      (r.awards.length >= 6 && r.allAmericans.length >= 2) ||
      (r.allAmericans.length >= 7 && r.awards.length >= 2) ||
      (r.nattys >= 2 && (r.heismans.length >= 1 || r.awards.length >= 3 || r.allAmericans.length >= 5)) ||
      r.score >= 125
    )
    .sort((a,b)=>b.score-a.score || a.player.localeCompare(b.player));
}
function PlayerHallOfFame({ teams, assignments, results, allAmericans, awards, heismans, nationalChampions }) {
  const rows = playerHallRows(teams, assignments, results, allAmericans, awards, heismans, nationalChampions).filter((row)=>row.score >= 150);
  return <section style={card}><h2 style={sectionTitle}>Player Hall of Fame</h2><p style={mutedText}>Player Hall of Fame is reserved for legendary careers only: multiple Heismans, Heisman plus major supporting accolades, dominant multi-award careers, or cornerstone players from championship eras.</p>{rows.length ? <div style={hofGrid}>{rows.map((row)=><PlayerHofCard key={row.key} row={row} team={teams.find((t)=>t.id===row.teamId)}/>)}</div> : <div style={miniRow}>No players have met Hall of Fame criteria yet.</div>}</section>;
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

      @media (max-width: 900px) {
        .cfb-mobile-page {
          gap: 12px !important;
        }

        .cfb-card {
          padding: 14px !important;
        }

        h1,
        h2 {
          overflow-wrap: anywhere;
        }

        button,
        input,
        select {
          min-height: 44px;
        }
      }

      @media (max-width: 720px) {
        .hide-on-mobile-table {
          display: none !important;
        }
      }

      @media (max-width: 640px) {
        body {
          font-size: 14px;
        }

        table {
          font-size: 12px;
        }
      }
    
      @keyframes cfbDraftTickerScroll {
        0% { transform: translateX(0); }
        100% { transform: translateX(-50%); }
      }

      @media (max-width: 900px) {
        .cfb-mobile-page {
          gap: 12px !important;
        }

        .cfb-card {
          padding: 14px !important;
          overflow-x: auto !important;
        }

        h1,
        h2 {
          overflow-wrap: anywhere;
        }

        button,
        input,
        select {
          min-height: 44px;
        }

        table {
          display: block;
          overflow-x: auto;
          white-space: nowrap;
        }
      }

      @media (max-width: 640px) {
        body {
          font-size: 14px;
        }

        .cfb-draft-ticker-track {
          animation-duration: 22s !important;
        }

        table {
          font-size: 12px;
        }
      }

      .cfb-draft-ticker-track:hover {
        animation-play-state: paused;
      }

      @media (max-width: 760px) {
        .cfb-responsive-grid {
          grid-template-columns: 1fr !important;
        }

        .cfb-mobile-page {
          gap: 12px !important;
        }

        .cfb-card {
          padding: 14px !important;
          overflow-x: auto !important;
        }

        h1,
        h2 {
          overflow-wrap: normal !important;
          word-break: normal !important;
        }

        button,
        input,
        select {
          min-height: 44px;
        }
      }

      @media (max-width: 520px) {
        table {
          display: block;
          overflow-x: auto;
          white-space: nowrap;
          font-size: 12px;
        }
      }

      /* draft-best-mobile-fix-v41 */
      @media (max-width: 700px) {
        .cfb-card {
          overflow-x: auto !important;
        }

        table {
          min-width: 920px;
        }
      }

      /* coach-v43-mobile */
      @media (max-width: 900px) {
        [style*="grid-template-columns: minmax(0,1.2fr) minmax(360px,.8fr)"] {
          grid-template-columns: 1fr !important;
        }
      }

      @media (max-width: 640px) {
        [style*="grid-template-columns: repeat(4, minmax(0, 1fr))"] {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }
      }

      /* v44-polish */
      th {
        text-align: left;
        color: #c4b5fd;
        font-size: 12px;
        letter-spacing: .08em;
        text-transform: uppercase;
        border-bottom: 1px solid rgba(250,204,21,.18);
        padding: 12px 10px;
        white-space: nowrap;
      }

      td {
        border-bottom: 1px solid rgba(148,163,184,.10);
        padding: 12px 10px;
        white-space: nowrap;
      }

      tr:hover td {
        background: rgba(255,255,255,.035);
      }

      ::selection {
        background: rgba(96,165,250,.35);
      }

      @media (max-width: 760px) {
        body {
          background: #020617 !important;
        }

        th,
        td {
          padding: 10px 8px;
        }
      }

      /* v45-ui-polish */
      small {
        display: block;
      }

      @media (max-width: 1000px) {
        [style*="grid-template-columns: minmax(0,1.1fr) minmax(420px,.9fr)"] {
          grid-template-columns: 1fr !important;
        }

        [style*="grid-template-columns: repeat(4, minmax(0, 1fr))"] {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }
      }

      @media (max-width: 620px) {
        [style*="grid-template-columns: 86px minmax(0,1fr)"] {
          grid-template-columns: 1fr !important;
          text-align: center !important;
          justify-items: center !important;
        }

        [style*="grid-template-columns: repeat(2, minmax(0, 1fr))"] {
          grid-template-columns: 1fr !important;
        }
      }

      /* v46-cfp-theme */
      body {
        background: #020617 !important;
      }

      :root {
        --cfb-gold: #d4af37;
        --cfb-panel: #0f172a;
        --cfb-bg: #020617;
        --cfb-border: rgba(255,255,255,.08);
        --cfb-text: #f8fafc;
      }

      /* v47-hard-theme */
      html,
      body,
      #root {
        background: #020617 !important;
        color: #f8fafc !important;
      }

      body {
        background:
          radial-gradient(circle at 50% -20%, rgba(212,175,55,.08), transparent 28%),
          #020617 !important;
      }

      :root {
        --cfb-gold: #d4af37;
        --cfb-panel: #0f172a;
        --cfb-bg: #020617;
        --cfb-border: rgba(255,255,255,.08);
        --cfb-text: #f8fafc;
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
    { title: "Media", keys: ["logoManager", "leagueDataCenter", "seasonStats", "teamStats", "recruitingRankings", "dynastyTimeline"] },
    { title: "Dynasty Legacy", keys: ["dynastyRecords", "rivalries", "powerIndex",  "coachingTree"] },
    { title: "Rankings", keys: ["eloRankings", "conferencePower"] },
    { title: "League History", keys: ["coachHOF", "playerHOF", "h2h"] },
    { title: "Recognition", keys: ["allAmericans", "awards", "heismans", "nationalChampions"] },
    { title: "Admin", keys: ["assignments"] },
  ];

  const tabMap = new Map(tabs);
  const hiddenWhenLocked = new Set([ "assignments", "commissionerCenter"]);
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
          position: "relative",
          overflow: "hidden",
          background: `linear-gradient(135deg, ${primary}ee, rgba(15,23,42,.96))`,
          border: `1px solid ${active ? accent : secondary}88`,
          boxShadow: active ? `0 0 0 1px ${accent}55, 0 0 24px ${accent}44` : `0 10px 24px rgba(0,0,0,.20)`,
          color: team?.accent_color || "#fff",
        }}
      >
        {(team?.logo_url) && <img src={team.logo_url} alt="" style={coachMenuLogoWatermark}/>}
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
function PrestigeSpotlight({ teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting, teamSeasonStats }) {
  const rows = typeof dynastyPrestigeRows === "function" ? dynastyPrestigeRows(teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting, teamSeasonStats).slice(0,5) : [];
  if (!rows.length) return null;

  return (
    <section style={prestigeSpotlight}>
      <div style={sectionTop}>
        <div>
          <div style={eyebrow}>Prestige Spotlight</div>
          <h2 style={sectionTitle}>Dynasty Power Programs</h2>
        </div>
      </div>
      <div style={prestigeSpotlightGrid}>
        {rows.map((row,index)=>(
          <div key={row.team.id} style={prestigeSpotlightCard}>
            <div style={leaderRow}><b>#{index+1}</b><span>{row.tier.stars}</span></div>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <TeamLogoMark team={row.team} size={54}/>
              <div>
                <div style={prestigeTeamName}>{row.team.name}</div>
                <div style={mutedText}>{row.tier.label}</div>
              </div>
            </div>
            <div style={prestigeScore}>{row.score}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Stats({ currentYear, setCurrentYear, currentWeek, setCurrentWeek, teams, assignments, saveSettings }) {
  const validTeamIds = new Set(teams.map((team)=>team.id));
  const activeCoaches = new Set(
    assignments
      .filter((assignment) =>
        assignment.status === "Active" &&
        assignment.discord_user_id &&
        assignment.team_id &&
        validTeamIds.has(assignment.team_id)
      )
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

function RecordBook({ users, teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting, seasonPlayerStats = [], teamSeasonStats = [] }) {
  const rows = recordBookRows(users, teams, assignments, results, allAmericans, awards, heismans, nationalChampions, recruiting, seasonPlayerStats, teamSeasonStats);

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
          legacy_helmet_url: previous[team.id]?.helmet_url ?? team.logo_url ?? "",
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
      <Table headers={["Preview", "Team", "Logo URL", "Primary Color", "Secondary Color", "Save"]}>
        {teams.map((team) => {
          const draft = drafts[team.id] || {            logo_url: team.logo_url || "",
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
function AllAmericans({ rows, teams }) {
  return (
    <section style={card}>
      <div style={sectionTop}>
        <div>
          <h2 style={sectionTitle}>All-Americans</h2>
          <p style={mutedText}>Read-only results. Add and edit All-Americans from League Data Center.</p>
        </div>
      </div>
      <div style={recognitionGrid}>
        {rows.length ? rows.map((r) => {
          const team = teams.find((t) => t.id === r.team_id);
          return (
            <div key={r.id} style={recognitionCard}>
              <div style={recognitionHeader}>
                <div>
                  <div style={recognitionKicker}>{r.type || "All-American"}</div>
                  <div style={recognitionPlayer}>{r.player_name || "Player"}</div>
                  <div style={recognitionMeta}>{r.position || "Position"} • {r.season_year || "Year"}</div>
                </div>
                <div style={recognitionTeamBadge}><TeamLabel team={team} name={team?.name || "Team"} /></div>
              </div>
            </div>
          );
        }) : <p style={mutedText}>No All-Americans recorded yet.</p>}
      </div>
    </section>
  );
}

function Awards({ rows, teams }) {
  return (
    <section style={card}>
      <div style={sectionTop}>
        <div>
          <h2 style={sectionTitle}>Awards</h2>
          <p style={mutedText}>Read-only results. Add and edit award winners from League Data Center.</p>
        </div>
      </div>
      <div style={recognitionGrid}>
        {rows.length ? rows.map((r) => {
          const team = teams.find((t) => t.id === r.team_id);
          return (
            <div key={r.id} style={recognitionCard}>
              <div style={recognitionHeader}>
                <div>
                  <div style={recognitionKicker}>{r.award_name || "Award"}</div>
                  <div style={recognitionPlayer}>{r.player_name || "Player"}</div>
                  <div style={recognitionMeta}>{r.position || "Position"} • {r.season_year || "Year"}</div>
                </div>
                <div style={recognitionTeamBadge}><TeamLabel team={team} name={team?.name || "Team"} /></div>
              </div>
            </div>
          );
        }) : <p style={mutedText}>No awards recorded yet.</p>}
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

  return <section style={teamPageStyle}><h2 style={teamSectionTitle}><TeamLabel team={team} /></h2><div style={teamCoachBanner}><div><div style={statTitle}>Current Discord User / Coach</div><div style={teamCoachNameStyle}>{coachName}</div></div><div><div style={statTitle}>Program Page</div><div style={mutedText}>Team history and coach profile combined.</div></div></div><div style={teamEncyclopediaPanel}>
    <div><div style={eyebrow}>Team Encyclopedia</div><h3 style={miniTitle}>Program Snapshot</h3></div>
    <div style={programRingRow}>
      <span>Coach: <b>{coachName}</b></span>
      <span>Recruiting Classes: <b>{recruiting.length}</b></span>
      <span>Awards: <b>{awards.length}</b></span>
      <span>All-Americans: <b>{allAmericans.length}</b></span>
      <span>Heismans: <b>{heismans.length}</b></span>
      <span>History Rows: <b>{historyRows.length}</b></span>
    </div>
  </div>
  <div style={statsGrid}><Stat title="Overall" value={`${stat.wins??0}-${stat.losses??0}`}/><Stat title="Avg PF" value={rec.avgPf}/><Stat title="Avg PA" value={rec.avgPa}/><Stat title="Top 25" value={top25Wins(team.id, results)}/><Stat title="Top 25 Class" value={recruiting.filter((r)=>Number(r.rank) >= 1 && Number(r.rank) <= 25).length}/><Stat title="Awards" value={awards.length}/><Stat title="All-Americans" value={allAmericans.length}/><Stat title="Heismans" value={heismans.length}/><Stat title="Conf Titles" value={titleCount(team.id, results, "Conference Championship Week")}/><Stat title="Nattys" value={titleCount(team.id, results, "National Championship Week")}/><Stat title="Bowl" value={`${bowl.wins}-${bowl.losses}`}/><Stat title="SOR" value={strengthOfResult(team.id, teams, allResults)}/></div><div style={twoCol}><div style={miniCard}><h3>Recruiting Rankings</h3><div style={formGrid}><input placeholder="Year" value={newRecruiting.season_year} onChange={(e)=>setNewRecruiting({...newRecruiting,season_year:e.target.value})} style={input}/><input placeholder="Rank" value={newRecruiting.rank} onChange={(e)=>setNewRecruiting({...newRecruiting,rank:e.target.value})} style={input}/><button onClick={()=>addRecruiting(team.id)} style={button}>Add</button></div>{recruiting.map((r)=><div key={r.id} style={miniRow}>{r.season_year}: #{r.rank} <DeleteButton onClick={()=>deleteRow("recruiting_classes",r.id)}/></div>)}</div><div style={miniCard}><h3>History</h3><div style={formGrid}><input placeholder="Year" value={newHistory.season_year} onChange={(e)=>setNewHistory({...newHistory,season_year:e.target.value})} style={input}/><input placeholder="Record" value={newHistory.record} onChange={(e)=>setNewHistory({...newHistory,record:e.target.value})} style={input}/><button onClick={()=>addHistory(team.id)} style={button}>Add</button></div>{historyRows.map((r)=><div key={r.id} style={miniRow}><input value={r.season_year} onChange={(e)=>updateRow("team_history_records",r.id,"season_year",Number(e.target.value))} style={smallInput}/><input value={r.record || ""} onChange={(e)=>updateRow("team_history_records",r.id,"record",e.target.value)} style={smallInput}/><DeleteButton onClick={()=>deleteRow("team_history_records",r.id)}/></div>)}</div></div><Results rows={results} deleteResult={()=>{}} search="" setSearch={()=>{}}/><div style={twoCol}><MiniList title="All-Americans" rows={allAmericans.map((r)=>`${r.player_name} — ${r.type}, ${r.position}, ${r.season_year}`)}/><MiniList title="Awards" rows={awards.map((r)=>`${r.player_name} — ${r.award_name}, ${r.position}, ${r.season_year}`)}/><MiniList title="Heisman Winners" rows={heismans.map((r)=>`${r.player_name} — ${r.position}, ${r.season_year}`)}/></div></section>;
}
function MiniList({ title, rows }) { return <div style={miniCard}><h3>{title}</h3>{rows.map((r,i)=><div key={i} style={miniRow}>{r}</div>)}</div>; }
function Table({ headers, children }) { return <div style={{overflowX:"auto",marginTop:20}}><table style={table}><thead><tr>{headers.map((h, index)=><th key={typeof h === "string" ? h : index} style={th}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
function DeleteButton({ onClick }) { return <button onClick={onClick} style={deleteButton}>Delete</button>; }

const page = {
  minHeight:"100vh",
  width:"100%",
  background:"#020617",
  color:"#f8fafc",
  overflowX:"hidden",
  fontFamily:"Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
};
const container={width:"100%",maxWidth:"1680px",margin:"0 auto",padding:"clamp(14px, 2vw, 28px)",boxSizing:"border-box"};
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
const statCard={background:"linear-gradient(145deg, rgba(15,23,42,.94), rgba(3,7,18,.985))",border:"1px solid rgba(96,165,250,.16)",borderRadius:16,padding:"clamp(16px, 2vw, 22px)",boxShadow:"0 18px 55px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.06)",minHeight:112};
const statTitle={color:"#c4b5fd",fontSize:12,marginBottom:10,textTransform:"uppercase",letterSpacing:".08em",fontWeight:900};
const statValue={fontSize:38,fontWeight:950,color:"#fff7ed"};
const statInput={...statValue,background:"transparent",color:"white",border:"none",outline:"none",width:"100%"};
const statSelect={background:"#111827",color:"#fff7ed",border:"1px solid rgba(250,204,21,.25)",borderRadius:12,padding:14,fontSize:24,fontWeight:900,width:"100%"};
const card = {
  background:"#0f172a",
  border:"1px solid rgba(255,255,255,.08)",
  borderRadius:16,
  padding:"clamp(16px, 2vw, 24px)",
  marginBottom:22,
  boxShadow:"0 22px 70px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.035)"
};
const sectionTop={display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,flexWrap:"wrap"};
const sectionTitle={fontSize:"clamp(22px, 2vw, 30px)",fontWeight:950,margin:0,color:"#f8fafc",letterSpacing:"-.035em"};
const formGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:16,marginTop:20};
const input = {
  background: "rgba(2,6,23,.82)",
  border: "1px solid rgba(100,116,139,.45)",
  color: "#fff",
  padding: 12,
  borderRadius: 12,
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
  outline: "none",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.045)",
};
const smallInput={...input,width:"120px",marginRight:8};
const searchInput={...input,maxWidth:320};
const button = {
  background: "linear-gradient(135deg,#2563eb,#1d4ed8)",
  color: "#fff",
  border: "1px solid rgba(147,197,253,.25)",
  borderRadius: 12,
  padding: 12,
  fontWeight: 950,
  cursor: "pointer",
  boxShadow: "0 14px 34px rgba(37,99,235,.22)",
};
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








const drawerOverlay = {
  position: "fixed",
  inset: 0,
  zIndex: 999,
  background: "rgba(0,0,0,.62)",
  backdropFilter: "blur(4px)",
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
    await loadData();
  }

  async function resumeDraftClock() {
    const { error: resumeError } = await supabase
      .from("cfb27_draft_settings")
      .update({ paused: false, updated_at: new Date().toISOString() })
      .eq("id", 1);

    if (resumeError) setError(`Resume clock failed: ${resumeError.message}`);
    setDraftSettings27((prev) => ({ ...prev, paused: false }));
    await loadData();
  }


  async function announceDraftPick(pickNumber, teamId) {
    if (!pickNumber || !teamId) {
      setError("Select a team before clicking Pick Is In.");
      return;
    }
    const now = new Date().toISOString();
    const { error: pickError } = await supabase
      .from("cfb27_draft_picks")
      .update({ team_id: teamId, picked_at: now, status: "pick_is_in" })
      .eq("pick_number", Number(pickNumber));

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
  background: "radial-gradient(circle at 50% -10%, rgba(250,204,21,.10), transparent 28%)",
};

const draftHero = {
  ...liquidGlassPanel,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.15fr) minmax(280px, .85fr)",
  gap: 18,
  alignItems: "stretch",
  border: "1px solid rgba(250,204,21,.32)",
  background: "radial-gradient(circle at 0% 0%, rgba(250,204,21,.22), transparent 28%), radial-gradient(circle at 100% 0%, rgba(37,99,235,.20), transparent 32%), linear-gradient(135deg, rgba(3,7,18,.98), rgba(30,27,75,.92))",
  boxShadow: "0 28px 90px rgba(0,0,0,.50), inset 0 1px 0 rgba(255,255,255,.08)",
};

const draftHeroTitle = {
  margin: "8px 0",
  color: "#fff",
  fontSize: "clamp(48px, 8vw, 104px)",
  lineHeight: .82,
  letterSpacing: "-.075em",
  fontWeight: 1000,
  textShadow: "0 20px 60px rgba(0,0,0,.35)",
};

const onClockCard = {
  ...liquidGlassTile,
  display: "grid",
  alignContent: "center",
  gap: 8,
  textAlign: "left",
  border: "1px solid rgba(250,204,21,.28)",
  background: "linear-gradient(145deg, rgba(15,23,42,.92), rgba(2,6,23,.98))",
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
  color: "#facc15",
  fontSize: "clamp(42px, 8vw, 88px)",
  fontWeight: 1000,
  letterSpacing: "-.055em",
  lineHeight: .82,
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
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const draftPickTile = {
  ...liquidGlassTile,
  padding: 14,
  border: "1px solid rgba(250,204,21,.18)",
  background: "linear-gradient(145deg, rgba(15,23,42,.94), rgba(3,7,18,.985))",
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
  border: "1px solid rgba(250,204,21,.18)",
  borderRadius: 18,
  padding: 14,
  display: "grid",
  gap: 7,
  color: "#fff",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.14), 0 16px 42px rgba(0,0,0,.28)",
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
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: 12,
  alignContent: "start",
  gridAutoRows: "minmax(108px, auto)",
  minHeight: 620,
  overflow: "visible",
};


const draftBroadcastBanner = {
  ...liquidGlassPanel,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 18,
  background: "radial-gradient(circle at 20% 0%, rgba(250,204,21,.24), transparent 34%), linear-gradient(135deg, rgba(2,6,23,.96), rgba(15,23,42,.88))",
  border: "1px solid rgba(250,204,21,.32)",
  boxShadow: "0 24px 80px rgba(0,0,0,.48), inset 0 1px 0 rgba(255,255,255,.08)",
};

const draftBroadcastTitle = {
  color: "#fff",
  fontSize: "clamp(38px, 7vw, 88px)",
  lineHeight: .84,
  letterSpacing: "-.07em",
  fontWeight: 1000,
  textTransform: "uppercase",
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


const recordGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 14,
  marginTop: 18,
};

const recordCard = {
  ...liquidGlassTile,
  display: "grid",
  gap: 12,
  minHeight: 170,
  alignContent: "start",
  textAlign: "center",
};

const recordValue = {
  color: "#facc15",
  fontWeight: 1000,
  fontSize: "clamp(28px, 6vw, 48px)",
  lineHeight: .9,
  letterSpacing: "-.05em",
};

const recordHolders = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  justifyContent: "center",
  alignItems: "center",
};

const recordHolderPill = {
  border: "1px solid rgba(255,255,255,.18)",
  background: "rgba(255,255,255,.09)",
  color: "#fff",
  borderRadius: 999,
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 950,
  maxWidth: "100%",
  minHeight: 34,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  lineHeight: 1.15,
  overflowWrap: "anywhere",
  wordBreak: "break-word",
};

const coachRingsPanel = {
  ...liquidGlassPanel,
  marginBottom: 18,
  padding: 18,
};

const coachRingGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
};

const coachRingTile = {
  ...liquidGlassTile,
  textAlign: "center",
  display: "grid",
  gap: 6,
  alignContent: "center",
  minHeight: 124,
};

const coachRingIcons = {
  minHeight: 28,
  fontSize: 22,
  display: "flex",
  justifyContent: "center",
  gap: 3,
  flexWrap: "wrap",
};

const coachRingValue = {
  color: "#fff",
  fontSize: "clamp(30px, 7vw, 56px)",
  fontWeight: 1000,
  lineHeight: .88,
  letterSpacing: "-.06em",
};

const superlativeRow = {
  marginTop: 14,
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const superlativePill = {
  border: "1px solid rgba(250,204,21,.30)",
  background: "rgba(250,204,21,.10)",
  color: "#fef3c7",
  borderRadius: 999,
  padding: "9px 12px",
  fontSize: 12,
  fontWeight: 950,
};


const mobileList = {
  display: "grid",
  gap: 12,
};

const managerCard = {
  ...liquidGlassTile,
  display: "grid",
  gap: 12,
};

const dangerButton = {
  border: "1px solid rgba(248,113,113,.38)",
  background: "linear-gradient(135deg, rgba(239,68,68,.92), rgba(127,29,29,.85))",
  color: "#fff",
  borderRadius: 16,
  padding: "12px 16px",
  fontWeight: 950,
  cursor: "pointer",
  boxShadow: "0 18px 42px rgba(248,113,113,.16), inset 0 1px 0 rgba(255,255,255,.18)",
};


const coachMenuLogoWatermark = {
  position: "absolute",
  right: 12,
  top: "50%",
  transform: "translateY(-50%)",
  width: 74,
  height: 74,
  objectFit: "contain",
  opacity: .20,
  pointerEvents: "none",
  zIndex: 0,
};

const massFormGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 12,
  marginTop: 18,
  marginBottom: 18,
};

const massFormCard = {
  ...liquidGlassTile,
  color: "#fff",
  textAlign: "left",
  display: "grid",
  gap: 8,
  cursor: "pointer",
};

const massFormIcon = {
  fontSize: 28,
};

const bulkTextArea = {
  ...input,
  minHeight: 220,
  resize: "vertical",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};













const entryPanel = {
  ...liquidGlassPanel,
  display: "grid",
  gap: 16,
};

const entryGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const recruitingMassGrid = {
  display: "grid",
  gap: 10,
  maxHeight: "65vh",
  overflow: "auto",
  paddingRight: 4,
};

const recruitingMassRow = {
  display: "grid",
  gridTemplateColumns: "minmax(190px, 1.4fr) repeat(6, minmax(72px, .55fr))",
  gap: 8,
  alignItems: "center",
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 14,
  padding: 10,
  background: "rgba(255,255,255,.045)",
  color: "#fff",
};




const commishGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
  marginTop: 18,
  marginBottom: 18,
};

const commishToolCard = {
  ...liquidGlassTile,
  color: "#fff",
  display: "grid",
  gap: 8,
  textAlign: "left",
  cursor: "pointer",
  minHeight: 112,
};

const logoManagerGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 14,
  marginTop: 18,
};

const logoManagerCard = {
  ...liquidGlassTile,
  display: "grid",
  gap: 10,
};

const logoPreviewBox = {
  height: 96,
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 16,
  display: "grid",
  placeItems: "center",
  background: "rgba(255,255,255,.045)",
  color: "rgba(255,255,255,.60)",
  overflow: "hidden",
};

const logoPreviewImg = {
  maxWidth: "84%",
  maxHeight: "84%",
  objectFit: "contain",
};

const prestigeGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 14,
  marginTop: 18,
};

const prestigeCard = {
  ...liquidGlassTile,
  display: "grid",
  gap: 12,
  minHeight: 230,
};

const prestigeScore = {
  color: "#facc15",
  fontSize: "clamp(42px, 10vw, 72px)",
  fontWeight: 1000,
  lineHeight: .85,
  letterSpacing: "-.07em",
};

const prestigeTierPill = {
  border: "1px solid rgba(250,204,21,.34)",
  background: "rgba(250,204,21,.12)",
  color: "#fef3c7",
  borderRadius: 999,
  padding: "7px 10px",
  fontSize: 12,
  fontWeight: 950,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
};

const prestigeTeamName = {
  color: "#fff",
  fontWeight: 1000,
  fontSize: 18,
  overflowWrap: "anywhere",
};

const prestigeMiniGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(105px, 1fr))",
  gap: 8,
  color: "rgba(255,255,255,.76)",
  fontSize: 12,
};


const broadcastHeaderGlow = {
  background: "linear-gradient(90deg, rgba(124,58,237,.35), transparent 70%)",
};

const heroBroadcastCard = {
  ...card,
  borderRadius: 22,
  border: "1px solid rgba(148,163,184,.24)",
  background: "linear-gradient(145deg, rgba(15,23,42,.96), rgba(6,10,28,.99))",
  boxShadow: "0 28px 90px rgba(0,0,0,.48), inset 0 1px 0 rgba(255,255,255,.075)",
};

const broadcastMetricCard = {
  ...statCard,
  borderRadius: 18,
  background: "linear-gradient(145deg, rgba(20,30,64,.92), rgba(8,12,30,.98))",
  border: "1px solid rgba(148,163,184,.22)",
  boxShadow: "0 18px 55px rgba(0,0,0,.32)",
};





const navShell = {
  position: "sticky",
  top: 0,
  zIndex: 20,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 20,
  padding: "12px 14px",
  border: "1px solid rgba(148,163,184,.18)",
  borderRadius: 18,
  background: "linear-gradient(90deg, rgba(5,8,25,.92), rgba(13,18,45,.82))",
  backdropFilter: "blur(16px)",
  boxShadow: "0 18px 60px rgba(0,0,0,.30)",
};

const hamburgerButton = {
  border: "1px solid rgba(167,139,250,.45)",
  background: "linear-gradient(135deg, rgba(88,28,135,.95), rgba(15,23,42,.96))",
  color: "#fff",
  borderRadius: 14,
  padding: "12px 16px",
  fontWeight: 1000,
  cursor: "pointer",
  boxShadow: "0 14px 34px rgba(124,58,237,.25)",
};

const activePagePill = {
  border: "1px solid rgba(148,163,184,.24)",
  background: "rgba(15,23,42,.72)",
  color: "#e5e7eb",
  borderRadius: 999,
  padding: "10px 14px",
  fontWeight: 900,
  fontSize: 13,
};

const drawerPanel = {
  width: "min(420px, 92vw)",
  height: "100%",
  background: "linear-gradient(180deg, rgba(5,8,25,.98), rgba(16,12,42,.98))",
  borderRight: "1px solid rgba(148,163,184,.20)",
  padding: 18,
  overflowY: "auto",
  boxShadow: "30px 0 90px rgba(0,0,0,.55)",
};

const colorDrawerItem = {
  position: "relative",
  width: "100%",
  minHeight: 58,
  borderRadius: 16,
  padding: "13px 16px 13px 18px",
  display: "flex",
  alignItems: "center",
  gap: 12,
  textAlign: "left",
  overflow: "hidden",
  cursor: "pointer",
  fontWeight: 950,
};

const coachDrawerItem = {
  position: "relative",
  width: "100%",
  minHeight: 72,
  borderRadius: 18,
  padding: "14px 18px",
  display: "flex",
  alignItems: "center",
  gap: 12,
  textAlign: "left",
  overflow: "hidden",
  cursor: "pointer",
  fontWeight: 950,
};


const coachHero2 = {
  ...broadcastPageCard,
  display: "grid",
  gridTemplateColumns: "auto minmax(0,1fr) auto",
  gap: 18,
  alignItems: "center",
  marginBottom: 18,
};

const coachHeroLogoBox = {
  width: 116,
  height: 116,
  borderRadius: 24,
  display: "grid",
  placeItems: "center",
  background: "rgba(255,255,255,.06)",
  border: "1px solid rgba(255,255,255,.14)",
  fontWeight: 1000,
};

const coachHeroName = {
  fontSize: "clamp(38px, 8vw, 72px)",
  fontWeight: 1000,
  letterSpacing: "-.06em",
  lineHeight: .88,
};

const coachHeroBadges = {
  display: "grid",
  gap: 8,
  justifyItems: "end",
};

const prestigeSpotlight = {
  ...broadcastPageCard,
  marginBottom: 26,
};

const prestigeSpotlightGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
  marginTop: 18,
};

const prestigeSpotlightCard = {
  ...liquidGlassTile,
  display: "grid",
  gap: 12,
  minHeight: 190,
  background: "linear-gradient(145deg, rgba(30,41,87,.75), rgba(8,12,30,.96))",
};

const teamEncyclopediaPanel = {
  ...broadcastPageCard,
  marginBottom: 16,
};

const programRingRow = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 10,
  color: "#fff",
  fontWeight: 900,
};


const sortHeaderButton = {
  background: "transparent",
  border: "none",
  color: "#f8fafc",
  fontWeight: 950,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const dataCenterTabs = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  margin: "18px 0",
};

const dataCenterTab = {
  ...button,
  padding: "11px 13px",
  background: "linear-gradient(135deg, rgba(30,41,59,.94), rgba(15,23,42,.94))",
};

const dashboardHero = {
  ...broadcastPageCard,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.35fr) minmax(260px, .65fr)",
  gap: 22,
  alignItems: "center",
};

const dashboardHeroTitle = {
  fontSize: "clamp(44px, 8vw, 92px)",
  fontWeight: 1000,
  letterSpacing: "-.075em",
  lineHeight: .88,
  margin: "10px 0",
};

const dashboardControls = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 10,
  marginTop: 18,
  maxWidth: 620,
};

const dashboardHeroMetrics = {
  display: "grid",
  gap: 12,
};

const dashboardMetric = {
  ...liquidGlassTile,
  display: "grid",
  gap: 6,
  minHeight: 104,
};

const headlineGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 12,
  marginTop: 16,
};

const headlineCard = {
  ...liquidGlassTile,
  fontSize: 16,
  fontWeight: 900,
  minHeight: 96,
  display: "flex",
  alignItems: "center",
};

const conferenceOverviewGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 12,
  marginTop: 16,
};

const conferenceOverviewCard = {
  ...liquidGlassTile,
  display: "grid",
  gap: 12,
};

const logoCluster = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
  minHeight: 38,
};

const positiveTrend = {
  color: "#86efac",
  fontSize: 12,
  fontWeight: 950,
};


const autoUserBox = {
  ...liquidGlassTile,
  minHeight: 48,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  color: "rgba(255,255,255,.78)",
  fontWeight: 850,
};

const sportsReferenceGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 14,
  marginBottom: 18,
};





const prestigeHistoryGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 14,
  marginTop: 18,
};

const prestigeHistoryCard = {
  ...liquidGlassTile,
  display: "grid",
  gap: 12,
  minHeight: 260,
};

const trendBars = {
  height: 84,
  display: "flex",
  alignItems: "end",
  gap: 5,
  padding: 8,
  borderRadius: 14,
  background: "rgba(255,255,255,.045)",
  border: "1px solid rgba(255,255,255,.10)",
};

const trendBar = {
  flex: 1,
  minWidth: 8,
  borderRadius: "6px 6px 0 0",
  background: "linear-gradient(180deg,#facc15,#7c3aed)",
};


const dynastyShell = {
  display: "grid",
  gap: 22,
};

const dynastyHero = {
  position: "relative",
  overflow: "hidden",
  borderRadius: 24,
  padding: "clamp(24px, 4vw, 44px)",
  border: "1px solid rgba(148,163,184,.24)",
  background: "radial-gradient(circle at 15% 0%, rgba(96,165,250,.26), transparent 28%), radial-gradient(circle at 85% 10%, rgba(124,58,237,.30), transparent 35%), linear-gradient(135deg, rgba(2,6,23,.96), rgba(12,18,45,.98))",
  boxShadow: "0 28px 90px rgba(0,0,0,.52), inset 0 1px 0 rgba(255,255,255,.08)",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(260px, 420px)",
  gap: 22,
  alignItems: "center",
};

const heroKicker = {
  color: "#60a5fa",
  fontSize: "clamp(18px, 2.1vw, 30px)",
  fontWeight: 1000,
  letterSpacing: ".12em",
  textTransform: "uppercase",
};

const dynastyHeroTitle = {
  fontSize: "clamp(40px, 5.6vw, 78px)",
  fontWeight: 950,
  lineHeight: 1.02,
  letterSpacing: "-.045em",
  margin: "8px 0 4px",
  color: "#fff",
  textShadow: "0 0 34px rgba(96,165,250,.20)",
  maxWidth: "100%",
};

const dynastyHeroSub = {
  color: "rgba(226,232,240,.82)",
  fontSize: "clamp(17px, 1.7vw, 24px)",
  fontWeight: 900,
  margin: 0,
  letterSpacing: "-.015em",
};

const heroControls = {
  display: "grid",
  gap: 12,
  padding: 16,
  borderRadius: 18,
  background: "rgba(2,6,23,.48)",
  border: "1px solid rgba(255,255,255,.10)",
};

const kpiGridV23 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};

const kpiCardV23 = {
  borderRadius: 18,
  padding: 20,
  background: "linear-gradient(145deg, rgba(15,23,42,.92), rgba(5,8,22,.98))",
  border: "1px solid rgba(148,163,184,.22)",
  boxShadow: "0 18px 60px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.06)",
  display: "grid",
  gap: 8,
};

const dashboardPanelGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))",
  gap: 16,
};

const mockPanel = {
  borderRadius: 20,
  padding: 18,
  background: "linear-gradient(145deg, rgba(10,16,39,.96), rgba(4,7,21,.99))",
  border: "1px solid rgba(148,163,184,.22)",
  boxShadow: "0 24px 80px rgba(0,0,0,.44), inset 0 1px 0 rgba(255,255,255,.06)",
  overflow: "hidden",
};

const panelHeaderV23 = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  marginBottom: 14,
};

const panelTitleV23 = {
  margin: 0,
  color: "#fff",
  fontSize: 21,
  fontWeight: 1000,
  letterSpacing: "-.03em",
};

const smallGhostButton = {
  border: "1px solid rgba(96,165,250,.26)",
  background: "rgba(15,23,42,.62)",
  color: "#dbeafe",
  borderRadius: 10,
  padding: "9px 11px",
  fontWeight: 900,
};

const rankListV23 = {
  display: "grid",
  gap: 8,
  marginBottom: 12,
};

const rankRowV23 = {
  width: "100%",
  border: "1px solid rgba(255,255,255,.10)",
  background: "rgba(255,255,255,.045)",
  color: "#fff",
  borderRadius: 13,
  padding: "10px 12px",
  display: "grid",
  gridTemplateColumns: "32px 36px minmax(0,1fr) auto",
  gap: 10,
  alignItems: "center",
  textAlign: "left",
  cursor: "pointer",
};

const rankBadgeV23 = {
  width: 28,
  height: 28,
  borderRadius: 999,
  display: "grid",
  placeItems: "center",
  background: "rgba(96,165,250,.16)",
  color: "#bfdbfe",
  fontWeight: 1000,
};

const newsListV23 = {
  display: "grid",
  gap: 10,
};

const newsItemV23 = {
  borderRadius: 14,
  padding: 12,
  background: "rgba(255,255,255,.045)",
  border: "1px solid rgba(255,255,255,.09)",
  color: "#fff",
  fontWeight: 900,
  display: "grid",
  gap: 6,
};

const conferenceCardsV23 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const conferenceCardV23 = {
  borderRadius: 16,
  padding: 14,
  background: "rgba(255,255,255,.045)",
  border: "1px solid rgba(255,255,255,.10)",
  display: "flex",
  gap: 12,
  alignItems: "center",
};

const conferenceLogoCircle = {
  width: 54,
  height: 54,
  borderRadius: 16,
  display: "grid",
  placeItems: "center",
  background: "rgba(255,255,255,.06)",
  border: "1px solid rgba(255,255,255,.10)",
};

const coachProfileBannerV23 = {
  position: "relative",
  overflow: "hidden",
  borderRadius: 26,
  padding: "clamp(20px, 3vw, 34px)",
  border: "1px solid rgba(148,163,184,.25)",
  boxShadow: "0 28px 90px rgba(0,0,0,.46), inset 0 1px 0 rgba(255,255,255,.08)",
  display: "grid",
  gridTemplateColumns: "auto minmax(0,1fr) minmax(200px, 260px)",
  gap: 22,
  alignItems: "center",
  marginBottom: 18,
};

const coachBannerLogoV23 = {
  width: 132,
  height: 132,
  borderRadius: 28,
  display: "grid",
  placeItems: "center",
  background: "rgba(255,255,255,.08)",
  border: "1px solid rgba(255,255,255,.14)",
};

const coachBannerMainV23 = {
  minWidth: 0,
};

const coachBannerNameV23 = {
  fontSize: "clamp(42px, 7vw, 88px)",
  fontWeight: 1000,
  lineHeight: .82,
  letterSpacing: "-.075em",
  color: "#fff",
  margin: "6px 0",
};

const coachPrestigeBoxV23 = {
  borderRadius: 18,
  padding: 18,
  background: "rgba(2,6,23,.42)",
  border: "1px solid rgba(255,255,255,.12)",
  display: "grid",
  gap: 8,
  textAlign: "center",
};

const coachReferenceGridV23 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 14,
  marginBottom: 18,
};

const hofProgressTrack = {
  width: "100%",
  height: 14,
  borderRadius: 999,
  overflow: "hidden",
  background: "rgba(255,255,255,.10)",
  border: "1px solid rgba(255,255,255,.12)",
  margin: "10px 0",
};

const hofProgressFill = {
  height: "100%",
  borderRadius: 999,
  background: "linear-gradient(90deg,#facc15,#22c55e)",
};


const dashboardCanvasV24 = {
  display: "grid",
  gap: 18,
};

const heroV24 = {
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) minmax(260px, 390px)",
  gap: 20,
  alignItems: "center",
  padding: "clamp(22px, 3vw, 38px)",
  borderRadius: 24,
  border: "1px solid rgba(96,165,250,.20)",
  background: "radial-gradient(circle at 18% 0%, rgba(96,165,250,.24), transparent 28%), radial-gradient(circle at 88% 20%, rgba(124,58,237,.22), transparent 34%), linear-gradient(135deg, rgba(3,7,18,.96), rgba(10,18,38,.98))",
  boxShadow: "0 28px 90px rgba(0,0,0,.50), inset 0 1px 0 rgba(255,255,255,.07)",
  overflow: "hidden",
};

const heroLogoLockupV24 = {
  display: "flex",
  alignItems: "center",
  gap: 20,
  minWidth: 0,
};

const heroLogoBoxV24 = {
  width: "clamp(72px, 9vw, 118px)",
  height: "clamp(72px, 9vw, 118px)",
  borderRadius: 22,
  display: "grid",
  placeItems: "center",
  background: "linear-gradient(145deg, rgba(15,23,42,.86), rgba(2,6,23,.95))",
  border: "1px solid rgba(255,255,255,.14)",
  fontSize: "clamp(21px, 2.7vw, 36px)",
  fontWeight: 1000,
  letterSpacing: "-.06em",
  color: "#fff",
  boxShadow: "0 20px 50px rgba(0,0,0,.32)",
};

const heroKickerV24 = {
  color: "#60a5fa",
  fontSize: "clamp(15px, 1.35vw, 21px)",
  fontWeight: 1000,
  letterSpacing: ".14em",
  textTransform: "uppercase",
};

const heroTitleV24 = {
  fontSize: "clamp(36px, 5vw, 72px)",
  fontWeight: 1000,
  lineHeight: .94,
  letterSpacing: "-.055em",
  margin: "5px 0 4px",
  color: "#f8fafc",
};

const heroSubV24 = {
  margin: 0,
  color: "rgba(226,232,240,.78)",
  fontSize: "clamp(17px, 1.8vw, 24px)",
  fontWeight: 900,
};

const heroControlsV24 = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  padding: 14,
  borderRadius: 18,
  background: "rgba(2,6,23,.44)",
  border: "1px solid rgba(255,255,255,.09)",
};

const kpiRailV24 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 12,
};

const kpiV24 = {
  minHeight: 116,
  borderRadius: 18,
  padding: 18,
  background: "linear-gradient(145deg, rgba(15,23,42,.92), rgba(3,7,18,.985))",
  border: "1px solid rgba(96,165,250,.14)",
  boxShadow: "0 18px 55px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.055)",
  display: "grid",
  gap: 6,
};

const mainGridV24 = {
  display: "grid",
  gridTemplateColumns: "minmax(320px,1.15fr) minmax(300px,.92fr) minmax(300px,.92fr)",
  gap: 16,
};

const panelV24 = {
  borderRadius: 20,
  padding: 16,
  background: "linear-gradient(145deg, rgba(8,13,31,.96), rgba(3,7,18,.99))",
  border: "1px solid rgba(148,163,184,.18)",
  boxShadow: "0 24px 80px rgba(0,0,0,.40), inset 0 1px 0 rgba(255,255,255,.055)",
  overflow: "hidden",
};

const panelHeaderV24 = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
};

const pillButtonV24 = {
  border: "1px solid rgba(96,165,250,.20)",
  background: "rgba(15,23,42,.62)",
  color: "#dbeafe",
  borderRadius: 999,
  padding: "8px 12px",
  fontWeight: 900,
};

const rankingRowsV24 = {
  display: "grid",
  gap: 8,
};

const rankingRowV24 = {
  width: "100%",
  border: "1px solid rgba(255,255,255,.09)",
  background: "rgba(255,255,255,.04)",
  color: "#fff",
  borderRadius: 13,
  padding: "10px 11px",
  display: "grid",
  gridTemplateColumns: "28px 38px minmax(0,1fr) auto",
  gap: 10,
  alignItems: "center",
  textAlign: "left",
  cursor: "pointer",
};

const embeddedRankingsV24 = {
  marginTop: 12,
  maxHeight: 420,
  overflow: "auto",
  borderTop: "1px solid rgba(255,255,255,.08)",
  paddingTop: 10,
};

const newsStackV24 = {
  display: "grid",
  gap: 10,
};

const newsCardV24 = {
  display: "grid",
  gridTemplateColumns: "38px minmax(0,1fr)",
  gap: 10,
  alignItems: "center",
  borderRadius: 14,
  padding: 12,
  background: "rgba(255,255,255,.04)",
  border: "1px solid rgba(255,255,255,.09)",
};

const newsIconV24 = {
  width: 34,
  height: 34,
  display: "grid",
  placeItems: "center",
  borderRadius: 10,
  background: "rgba(96,165,250,.12)",
};

const conferenceGridV24 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 12,
};

const conferenceV24 = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  borderRadius: 15,
  padding: 13,
  background: "rgba(255,255,255,.04)",
  border: "1px solid rgba(255,255,255,.09)",
};

const conferenceMarkV24 = {
  width: 54,
  height: 54,
  display: "grid",
  placeItems: "center",
  borderRadius: 15,
  background: "rgba(255,255,255,.055)",
  border: "1px solid rgba(255,255,255,.09)",
};



const proPageV26 = {
  display: "grid",
  gap: 18,
};

const proHeroV26 = {
  position: "relative",
  overflow: "hidden",
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) minmax(280px,410px)",
  gap: 22,
  alignItems: "center",
  padding: "clamp(24px, 4vw, 46px)",
  borderRadius: 28,
  border: "1px solid rgba(96,165,250,.22)",
  background: "radial-gradient(circle at 18% 0%, rgba(96,165,250,.22), transparent 28%), radial-gradient(circle at 88% 18%, rgba(124,58,237,.18), transparent 32%), linear-gradient(135deg, rgba(2,6,23,.96), rgba(9,17,34,.98))",
  boxShadow: "0 30px 100px rgba(0,0,0,.52), inset 0 1px 0 rgba(255,255,255,.075)",
};

const proHeroCopyV26 = {
  minWidth: 0,
};

const proEyebrowV26 = {
  color: "#60a5fa",
  fontSize: "clamp(14px, 1.2vw, 19px)",
  fontWeight: 1000,
  letterSpacing: ".16em",
  textTransform: "uppercase",
};

const proHeroTitleV26 = {
  fontSize: "clamp(38px, 5.2vw, 74px)",
  fontWeight: 1000,
  lineHeight: .98,
  letterSpacing: "-.055em",
  margin: "7px 0 6px",
  color: "#f8fafc",
};

const proHeroMetaV26 = {
  color: "rgba(226,232,240,.80)",
  fontSize: "clamp(17px, 1.7vw, 25px)",
  fontWeight: 900,
};

const proHeroControlsV26 = {
  display: "grid",
  gap: 10,
  padding: 16,
  borderRadius: 18,
  background: "rgba(2,6,23,.50)",
  border: "1px solid rgba(255,255,255,.10)",
};

const proLabelV26 = {
  display: "block",
  color: "rgba(255,255,255,.60)",
  fontSize: 11,
  fontWeight: 950,
  textTransform: "uppercase",
  letterSpacing: ".08em",
  marginBottom: 6,
};

const proKpiGridV26 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 12,
};

const proKpiV26 = {
  borderRadius: 18,
  padding: 18,
  minHeight: 112,
  background: "linear-gradient(145deg, rgba(15,23,42,.92), rgba(3,7,18,.985))",
  border: "1px solid rgba(96,165,250,.14)",
  boxShadow: "0 18px 55px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.055)",
  display: "grid",
  gap: 6,
};

const proThreeColV26 = {
  display: "grid",
  gridTemplateColumns: "minmax(320px,1.12fr) minmax(290px,.94fr) minmax(290px,.94fr)",
  gap: 16,
};

const proPanelV26 = {
  borderRadius: 20,
  padding: 16,
  background: "linear-gradient(145deg, rgba(8,13,31,.96), rgba(3,7,18,.99))",
  border: "1px solid rgba(148,163,184,.18)",
  boxShadow: "0 24px 80px rgba(0,0,0,.40), inset 0 1px 0 rgba(255,255,255,.055)",
  overflow: "hidden",
};

const proPanelHeadV26 = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
};

const proListV26 = {
  display: "grid",
  gap: 8,
};

const proRankRowV26 = {
  width: "100%",
  border: "1px solid rgba(255,255,255,.09)",
  background: "rgba(255,255,255,.04)",
  color: "#fff",
  borderRadius: 13,
  padding: "10px 11px",
  display: "grid",
  gridTemplateColumns: "28px 38px minmax(0,1fr) auto",
  gap: 10,
  alignItems: "center",
  textAlign: "left",
  cursor: "pointer",
};

const proInsetV26 = {
  marginTop: 12,
  maxHeight: 360,
  overflow: "auto",
  borderTop: "1px solid rgba(255,255,255,.08)",
  paddingTop: 10,
};

const proNewsV26 = {
  display: "grid",
  gap: 10,
};

const proNewsItemV26 = {
  display: "grid",
  gridTemplateColumns: "34px minmax(0,1fr)",
  gap: 10,
  alignItems: "center",
  borderRadius: 14,
  padding: 12,
  background: "rgba(255,255,255,.04)",
  border: "1px solid rgba(255,255,255,.09)",
};

const proConferenceGridV26 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 12,
};

const proConferenceCardV26 = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  borderRadius: 15,
  padding: 13,
  background: "rgba(255,255,255,.04)",
  border: "1px solid rgba(255,255,255,.09)",
};

const proConferenceLogoV26 = {
  width: 54,
  height: 54,
  borderRadius: 15,
  display: "grid",
  placeItems: "center",
  background: "rgba(255,255,255,.055)",
  border: "1px solid rgba(255,255,255,.09)",
};








const mockDashboardV27 = {
  display: "grid",
  gap: 16,
  color: "#f8fafc",
};

const mockHeroV27 = {
  position: "relative",
  minHeight: 154,
  borderRadius: 18,
  border: "1px solid rgba(59,130,246,.22)",
  background: "radial-gradient(circle at 50% 0%, rgba(59,130,246,.26), transparent 32%), linear-gradient(135deg, rgba(2,6,23,.98), rgba(8,13,31,.98))",
  boxShadow: "0 24px 70px rgba(0,0,0,.48), inset 0 1px 0 rgba(255,255,255,.07)",
  overflow: "hidden",
  display: "grid",
  gridTemplateColumns: "1fr auto",
  alignItems: "center",
  gap: 18,
  padding: "24px 28px",
};

const mockHeroCenterV27 = {
  display: "grid",
  justifyItems: "center",
  textAlign: "center",
  minWidth: 0,
};

const mockMiniLogoV27 = {
  color: "#e5e7eb",
  fontSize: "clamp(30px, 4.2vw, 58px)",
  fontWeight: 1000,
  letterSpacing: "-.045em",
  lineHeight: .9,
};

const mockHeroTitleV27 = {
  margin: "5px 0 0",
  color: "#60a5fa",
  fontSize: "clamp(18px, 1.9vw, 28px)",
  fontWeight: 1000,
  letterSpacing: ".03em",
  textTransform: "uppercase",
};

const mockHeroSubtitleV27 = {
  marginTop: 8,
  color: "rgba(226,232,240,.78)",
  fontSize: 14,
  fontWeight: 900,
};

const mockHeroControlsV27 = {
  width: 230,
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
  alignSelf: "start",
};

const mockSelectV27 = {
  background: "rgba(15,23,42,.86)",
  border: "1px solid rgba(148,163,184,.22)",
  color: "#fff",
  borderRadius: 10,
  padding: "10px 11px",
  fontWeight: 850,
  outline: "none",
};

const mockPrimaryButtonV27 = {
  gridColumn: "1 / -1",
  border: "1px solid rgba(37,99,235,.35)",
  background: "linear-gradient(135deg,#2563eb,#7c3aed)",
  color: "#fff",
  borderRadius: 10,
  padding: 11,
  fontWeight: 950,
  cursor: "pointer",
};

const mockKpiGridV27 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const mockKpiV27 = {
  minHeight: 94,
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,.16)",
  background: "linear-gradient(145deg, rgba(15,23,42,.92), rgba(3,7,18,.98))",
  padding: 16,
  display: "grid",
  gap: 5,
  boxShadow: "0 14px 40px rgba(0,0,0,.30)",
};

const mockMainGridV27 = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
};

const mockPanelV27 = {
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,.16)",
  background: "linear-gradient(145deg, rgba(8,13,31,.96), rgba(3,7,18,.99))",
  boxShadow: "0 18px 54px rgba(0,0,0,.36), inset 0 1px 0 rgba(255,255,255,.05)",
  padding: 14,
  overflow: "hidden",
};

const mockPanelHeaderV27 = {
  display: "grid",
  gap: 4,
  marginBottom: 12,
};

const mockRankingListV27 = {
  display: "grid",
  gap: 7,
};

const mockRankingRowV27 = {
  width: "100%",
  border: "1px solid rgba(255,255,255,.08)",
  background: "rgba(255,255,255,.035)",
  color: "#fff",
  borderRadius: 10,
  padding: "9px 10px",
  display: "grid",
  gridTemplateColumns: "24px 34px minmax(0,1fr) auto",
  gap: 8,
  alignItems: "center",
  textAlign: "left",
  cursor: "pointer",
};

const mockSecondaryButtonV27 = {
  width: "100%",
  marginTop: 10,
  border: "1px solid rgba(96,165,250,.20)",
  background: "rgba(15,23,42,.72)",
  color: "#dbeafe",
  borderRadius: 10,
  padding: 10,
  fontWeight: 900,
  cursor: "pointer",
};

const mockNewsStackV27 = {
  display: "grid",
  gap: 8,
};

const mockNewsItemV27 = {
  display: "grid",
  gridTemplateColumns: "34px minmax(0,1fr)",
  gap: 9,
  alignItems: "center",
  borderRadius: 10,
  padding: 10,
  background: "rgba(255,255,255,.035)",
  border: "1px solid rgba(255,255,255,.08)",
};

const mockNewsIconV27 = {
  width: 30,
  height: 30,
  borderRadius: 9,
  display: "grid",
  placeItems: "center",
  background: "rgba(96,165,250,.12)",
};

const mockConferenceGridV27 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 10,
};

const mockConferenceCardV27 = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,.08)",
  background: "rgba(255,255,255,.035)",
  padding: 11,
};

const mockConferenceLogoV27 = {
  width: 48,
  height: 48,
  borderRadius: 12,
  display: "grid",
  placeItems: "center",
  background: "rgba(255,255,255,.055)",
  border: "1px solid rgba(255,255,255,.08)",
};


const v29Dashboard = {
  display: "grid",
  gap: 16,
};

const v29Hero = {
  minHeight: 170,
  borderRadius: 18,
  border: "1px solid rgba(59,130,246,.24)",
  background: "radial-gradient(circle at 50% 0%, rgba(59,130,246,.25), transparent 32%), radial-gradient(circle at 95% 0%, rgba(124,58,237,.14), transparent 30%), linear-gradient(135deg, rgba(2,6,23,.98), rgba(8,13,31,.98))",
  boxShadow: "0 24px 70px rgba(0,0,0,.48), inset 0 1px 0 rgba(255,255,255,.07)",
  overflow: "hidden",
  display: "grid",
  gridTemplateColumns: "1fr auto",
  alignItems: "center",
  gap: 18,
  padding: "24px 28px",
};

const v29HeroBrand = {
  textAlign: "center",
  display: "grid",
  gap: 6,
  justifyItems: "center",
};

const v29LogoText = {
  fontSize: "clamp(40px, 5.2vw, 78px)",
  fontWeight: 1000,
  letterSpacing: "-.055em",
  lineHeight: .88,
  color: "#e5e7eb",
  textShadow: "0 0 30px rgba(96,165,250,.22)",
};

const v29HeroSubLogo = {
  color: "#60a5fa",
  fontSize: "clamp(18px, 2vw, 29px)",
  fontWeight: 1000,
  letterSpacing: ".04em",
  textTransform: "uppercase",
};

const v29HeroControls = {
  width: 246,
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
  alignSelf: "start",
};

const v29ControlLabel = {
  color: "rgba(255,255,255,.68)",
  fontSize: 11,
  fontWeight: 950,
  textTransform: "uppercase",
  letterSpacing: ".08em",
  display: "grid",
  gap: 5,
};

const v29Select = {
  background: "rgba(15,23,42,.86)",
  border: "1px solid rgba(148,163,184,.22)",
  color: "#fff",
  borderRadius: 10,
  padding: "10px 11px",
  fontWeight: 850,
  outline: "none",
};

const v29SaveButton = {
  gridColumn: "1 / -1",
  border: "1px solid rgba(37,99,235,.35)",
  background: "linear-gradient(135deg,#2563eb,#7c3aed)",
  color: "#fff",
  borderRadius: 10,
  padding: 11,
  fontWeight: 950,
  cursor: "pointer",
};

const v29KpiGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const v29Kpi = {
  minHeight: 94,
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,.16)",
  background: "linear-gradient(145deg, rgba(15,23,42,.92), rgba(3,7,18,.98))",
  padding: 16,
  display: "grid",
  gap: 5,
  boxShadow: "0 14px 40px rgba(0,0,0,.30)",
};

const v29ThreeGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
};

const v29Panel = {
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,.16)",
  background: "linear-gradient(145deg, rgba(8,13,31,.96), rgba(3,7,18,.99))",
  boxShadow: "0 18px 54px rgba(0,0,0,.36), inset 0 1px 0 rgba(255,255,255,.05)",
  padding: 14,
  overflow: "hidden",
};

const v29PanelTitle = {
  display: "grid",
  gap: 4,
  marginBottom: 12,
};

const v29List = {
  display: "grid",
  gap: 7,
};

const v29RankRow = {
  width: "100%",
  border: "1px solid rgba(255,255,255,.08)",
  background: "rgba(255,255,255,.035)",
  color: "#fff",
  borderRadius: 10,
  padding: "9px 10px",
  display: "grid",
  gridTemplateColumns: "24px 34px minmax(0,1fr) auto",
  gap: 8,
  alignItems: "center",
  textAlign: "left",
  cursor: "pointer",
};

const v29PanelButton = {
  width: "100%",
  marginTop: 10,
  border: "1px solid rgba(96,165,250,.20)",
  background: "rgba(15,23,42,.72)",
  color: "#dbeafe",
  borderRadius: 10,
  padding: 10,
  fontWeight: 900,
  cursor: "pointer",
};

const v29NewsList = {
  display: "grid",
  gap: 8,
};

const v29News = {
  display: "grid",
  gridTemplateColumns: "34px minmax(0,1fr)",
  gap: 9,
  alignItems: "center",
  borderRadius: 10,
  padding: 10,
  background: "rgba(255,255,255,.035)",
  border: "1px solid rgba(255,255,255,.08)",
};

const v29ConferenceGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 10,
};

const v29ConferenceCard = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,.08)",
  background: "rgba(255,255,255,.035)",
  padding: 11,
};

const v29ConferenceLogo = {
  width: 48,
  height: 48,
  borderRadius: 12,
  display: "grid",
  placeItems: "center",
  background: "rgba(255,255,255,.055)",
  border: "1px solid rgba(255,255,255,.08)",
};

const liquidGlassTile = {
  background: "linear-gradient(145deg, rgba(15,23,42,.86), rgba(3,7,18,.96))",
  border: "1px solid rgba(148,163,184,.16)",
  borderRadius: 14,
  padding: 13,
  boxShadow: "0 16px 44px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.05)",
};

const broadcastCard = {
  background:"#0f172a",
  border:"1px solid rgba(255,255,255,.08)",
  borderRadius:18,
  padding:"clamp(16px, 2vw, 24px)",
  boxShadow:"0 22px 70px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.035)"
};

const broadcastPageCard = {
  ...card,
  borderRadius: 18,
  background: "linear-gradient(145deg, rgba(8,13,31,.96), rgba(3,7,18,.99))",
  border: "1px solid rgba(148,163,184,.18)",
  boxShadow: "0 24px 80px rgba(0,0,0,.40), inset 0 1px 0 rgba(255,255,255,.055)",
};


const dashboardPro = {
  display: "grid",
  gap: 18,
};

const dashboardHeroPro = {
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) minmax(260px, 360px)",
  gap: 18,
  alignItems: "center",
  borderRadius: 24,
  padding: "clamp(24px, 4vw, 44px)",
  border: "1px solid rgba(96,165,250,.22)",
  background: "radial-gradient(circle at 18% 0%, rgba(96,165,250,.22), transparent 30%), radial-gradient(circle at 90% 10%, rgba(124,58,237,.20), transparent 32%), linear-gradient(135deg, rgba(2,6,23,.98), rgba(8,13,31,.96))",
  boxShadow: "0 28px 90px rgba(0,0,0,.48), inset 0 1px 0 rgba(255,255,255,.07)",
};

const dashboardKickerPro = {
  color: "#60a5fa",
  fontWeight: 1000,
  letterSpacing: ".15em",
  textTransform: "uppercase",
  fontSize: 13,
};

const dashboardTitlePro = {
  margin: "8px 0 6px",
  color: "#f8fafc",
  fontSize: "clamp(44px, 6.6vw, 94px)",
  lineHeight: .88,
  letterSpacing: "-.07em",
  fontWeight: 1000,
};

const dashboardSubPro = {
  margin: 0,
  color: "rgba(226,232,240,.82)",
  fontSize: "clamp(18px, 2vw, 27px)",
  fontWeight: 900,
};

const dashboardControlsPro = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  padding: 14,
  borderRadius: 16,
  background: "rgba(2,6,23,.50)",
  border: "1px solid rgba(255,255,255,.09)",
};

const dashboardKpiPro = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 12,
};

const dashboardKpiCardPro = {
  minHeight: 118,
  borderRadius: 16,
  padding: 16,
  border: "1px solid rgba(255,255,255,.08)",
  background: "#0f172a",
  boxShadow: "0 18px 48px rgba(0,0,0,.26), inset 0 1px 0 rgba(255,255,255,.035)",
  display: "grid",
  gap: 8,
  alignContent: "center",
};

const dashboardFeatureGridPro = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.15fr) minmax(320px, .85fr)",
  gap: 16,
};

const dashboardRankPanelPro = {
  borderRadius: 20,
  padding: 18,
  border: "1px solid rgba(96,165,250,.18)",
  background: "linear-gradient(145deg, rgba(8,13,31,.96), rgba(3,7,18,.99))",
  boxShadow: "0 24px 80px rgba(0,0,0,.40), inset 0 1px 0 rgba(255,255,255,.055)",
  overflowX: "auto",
};

const dashboardSideStackPro = {
  display: "grid",
  gap: 16,
};

const dashboardSmallPanelPro = {
  borderRadius: 20,
  padding: 16,
  border: "1px solid rgba(148,163,184,.16)",
  background: "linear-gradient(145deg, rgba(8,13,31,.96), rgba(3,7,18,.99))",
  boxShadow: "0 18px 55px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.055)",
};

const dashboardPanelHeaderPro = {
  display: "grid",
  gap: 4,
  marginBottom: 14,
};

const dashboardRankingListPro = {
  display: "grid",
  gap: 9,
};



const dashboardMiniListPro = {
  display: "grid",
  gap: 8,
};

const dashboardMiniRowPro = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "34px 34px minmax(0,1fr) auto",
  gap: 9,
  alignItems: "center",
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 12,
  padding: 10,
  background: "rgba(255,255,255,.035)",
  color: "#fff",
  textAlign: "left",
  cursor: "pointer",
};

const dashboardNewsListPro = {
  display: "grid",
  gap: 9,
};

const dashboardNewsRowPro = {
  display: "grid",
  gridTemplateColumns: "34px minmax(0,1fr)",
  gap: 12,
  alignItems: "center",
  borderRadius: 12,
  padding: "12px 14px",
  background: "rgba(255,255,255,.035)",
  border: "1px solid rgba(255,255,255,.08)",
};




const dashboardTeamCellPro = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
};

const dashboardTopThreeMini = {
  display: "grid",
  gap: 4,
  marginTop: 4,
};


const dashboardTableHeadPro = {
  display: "grid",
  gridTemplateColumns: "52px minmax(190px,1.25fr) minmax(120px,.7fr) 54px 54px 80px 80px 78px 70px 82px",
  gap: 10,
  alignItems: "center",
  color: "rgba(219,234,254,.72)",
  textTransform: "uppercase",
  letterSpacing: ".08em",
  fontSize: 11,
  fontWeight: 950,
  padding: "0 14px 8px",
  minWidth: 940,
};

const dashboardHeaderButtonPro = {
  background: "transparent",
  border: 0,
  color: "rgba(219,234,254,.72)",
  textAlign: "left",
  fontSize: 11,
  fontWeight: 950,
  textTransform: "uppercase",
  letterSpacing: ".08em",
  cursor: "pointer",
  padding: 0,
};

const dashboardRankRowPro = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "58px minmax(190px,1.25fr) minmax(120px,.7fr) 54px 54px 80px 80px 78px 70px 82px",
  gap: 10,
  alignItems: "center",
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 14,
  padding: "12px 14px",
  color: "#f8fafc",
  textAlign: "left",
  cursor: "pointer",
  minWidth: 940,
};


const dashboardProV37 = {
  display: "grid",
  gap: 18,
};

const dashboardHeroV37 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
  gap: 18,
  alignItems: "center",
  borderRadius: 18,
  padding: "clamp(20px, 4vw, 48px)",
  border: "1px solid rgba(255,255,255,.08)",
  background: "#0f172a",
  boxShadow: "0 24px 80px rgba(0,0,0,.48), inset 0 1px 0 rgba(255,255,255,.035)",
  overflow: "hidden",
};

const dashboardTitleV37={
  margin: "8px 0 8px",
  color: "#f8fafc",
  fontSize: "clamp(34px, 9vw, 92px)",
  lineHeight: .9,
  letterSpacing: "-.055em",
  fontWeight: 1000,
  overflowWrap: "normal",
  wordBreak: "normal",
};

const dashboardRankPanelFullV37 = {
  borderRadius: 16,
  padding: 20,
  border: "1px solid rgba(255,255,255,.08)",
  background: "#0f172a",
  boxShadow: "0 24px 70px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.035)",
  overflowX: "auto",
};

const draftBroadcastPageV37 = {
  display: "grid",
  gap: 16,
};

const draftOnClockHeroV37 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
  gap: 18,
  alignItems: "stretch",
  borderRadius: 26,
  padding: "clamp(18px, 4vw, 42px)",
  border: "1px solid rgba(250,204,21,.34)",
  background: "radial-gradient(circle at 12% 0%, rgba(250,204,21,.22), transparent 30%), radial-gradient(circle at 90% 0%, rgba(37,99,235,.22), transparent 34%), linear-gradient(135deg, rgba(2,6,23,.98), rgba(30,27,75,.92))",
  boxShadow: "0 30px 100px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.08)",
  overflow: "hidden",
};

const draftOnClockMainV37 = {
  display: "grid",
  alignContent: "center",
  gap: 6,
};

const draftOnClockNameV37 = {
  margin: 0,
  color: "#fff",
  fontSize: "clamp(40px, 12vw, 110px)",
  lineHeight: .88,
  letterSpacing: "-.055em",
  fontWeight: 1000,
  overflowWrap: "anywhere",
};

const draftOnClockMetaV37 = {
  color: "#facc15",
  fontSize: "clamp(24px, 4vw, 48px)",
  fontWeight: 1000,
};

const draftTimerCardV37 = {
  borderRadius: 22,
  padding: 22,
  display: "grid",
  alignContent: "center",
  gap: 8,
  background: "rgba(2,6,23,.62)",
  border: "1px solid rgba(255,255,255,.12)",
};

const draftTickerV37 = {
  borderRadius: 16,
  padding: "12px 16px",
  display: "flex",
  gap: 20,
  overflowX: "auto",
  background: "linear-gradient(90deg, rgba(250,204,21,.12), rgba(37,99,235,.10))",
  border: "1px solid rgba(250,204,21,.20)",
  color: "#f8fafc",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const draftControlBarV37 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 10,
  padding: 14,
  borderRadius: 18,
  background: "rgba(15,23,42,.72)",
  border: "1px solid rgba(148,163,184,.18)",
};

const draftMainBoardV37 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
  gap: 16,
};

const draftBoardPanelV37 = {
  ...broadcastCard,
  overflow: "hidden",
};

const draftAvailablePanelV37 = {
  ...broadcastCard,
  overflow: "hidden",
};

const draftBoardRowsV37 = {
  display: "grid",
  gap: 8,
  marginTop: 12,
};

const draftBoardRowV37 = {
  display: "grid",
  gridTemplateColumns: "64px minmax(160px,.9fr) minmax(170px,1fr) 110px auto auto",
  gap: 10,
  alignItems: "center",
  borderRadius: 12,
  padding: "10px 12px",
  background: "rgba(255,255,255,.035)",
  border: "1px solid rgba(148,163,184,.30)",
  color: "#fff",
  minWidth: 720,
};

const draftAvailableGridV37 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 10,
  marginTop: 10,
};

const draftAvailableTileV37 = {
  minHeight: 136,
  borderRadius: 16,
  padding: 12,
  display: "grid",
  gap: 6,
  alignContent: "start",
  textAlign: "left",
  color: "#fff",
  border: "1px solid rgba(255,255,255,.18)",
  cursor: "pointer",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.14), 0 14px 32px rgba(0,0,0,.26)",
  overflow: "hidden",
};

const coachPageV37 = {
  display: "grid",
  gap: 18,
};

const coachHeroV37 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
  gap: 18,
  alignItems: "center",
  borderRadius: 28,
  padding: "clamp(18px, 4vw, 42px)",
  border: "1px solid rgba(255,255,255,.18)",
  boxShadow: "0 30px 100px rgba(0,0,0,.52), inset 0 1px 0 rgba(255,255,255,.08)",
  overflow: "hidden",
};

const coachLogoV37 = {
  width: 142,
  height: 142,
  borderRadius: 26,
  display: "grid",
  placeItems: "center",
  background: "rgba(255,255,255,.08)",
  border: "1px solid rgba(255,255,255,.14)",
};

const coachNameV37 = {
  margin: "6px 0",
  color: "#fff",
  fontSize: "clamp(38px, 11vw, 96px)",
  lineHeight: .88,
  letterSpacing: "-.055em",
  fontWeight: 1000,
  overflowWrap: "anywhere",
};

const coachSubV37 = {
  margin: 0,
  color: "rgba(226,232,240,.82)",
  fontWeight: 850,
};

const coachPrestigeV37 = {
  display: "grid",
  gap: 6,
  textAlign: "center",
  borderRadius: 20,
  padding: 18,
  background: "rgba(2,6,23,.58)",
  border: "1px solid rgba(255,255,255,.12)",
};

const coachQuickStatsV37 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))",
  gap: 12,
};

const coachGridV37 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
};

const coachPanelV37 = {
  ...broadcastCard,
  marginBottom: 0,
};


const dashboardWirePanelV38 = {
  borderRadius: 16,
  padding: 18,
  border: "1px solid rgba(255,255,255,.08)",
  background: "#0f172a",
  boxShadow: "0 18px 55px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.035)",
};

const draftLowerThirdV38 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
  gap: 10,
  alignItems: "center",
  borderRadius: 14,
  padding: "12px 16px",
  background: "linear-gradient(90deg, rgba(250,204,21,.92), rgba(217,119,6,.88))",
  color: "#020617",
  border: "1px solid rgba(250,204,21,.35)",
  boxShadow: "0 18px 48px rgba(0,0,0,.30)",
  fontWeight: 1000,
  overflow: "hidden",
};

const draftEspnTickerV38 = {
  borderRadius: 0,
  padding: "10px 0",
  overflow: "hidden",
  background: "linear-gradient(90deg, #020617, #111827)",
  borderTop: "2px solid #facc15",
  borderBottom: "2px solid #facc15",
  color: "#f8fafc",
  fontWeight: 1000,
  whiteSpace: "nowrap",
  textTransform: "uppercase",
};

const coachFeatureGridV38 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
};

const coachPrestigeTrendV38 = {
  height: 170,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(36px,1fr))",
  alignItems: "end",
  gap: 10,
  padding: "18px 6px 4px",
};

const coachTrendColumnV38 = {
  height: 150,
  display: "grid",
  gridTemplateRows: "1fr auto",
  alignItems: "end",
  gap: 8,
  textAlign: "center",
};

const coachTrendBarV38 = {
  width: "100%",
  minHeight: 12,
  borderRadius: "10px 10px 4px 4px",
  boxShadow: "0 12px 30px rgba(0,0,0,.28)",
};

const coachRecruitGraphV38 = {
  display: "grid",
  gap: 8,
};

const coachTrophyGridV38 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(92px, 1fr))",
  gap: 10,
};

const coachTrophyV38 = {
  minHeight: 96,
  borderRadius: 14,
  display: "grid",
  placeItems: "center",
  textAlign: "center",
  padding: 10,
  background: "rgba(255,255,255,.045)",
  border: "1px solid rgba(255,255,255,.10)",
};

const draftTickerTrackV39 = {
  display: "inline-flex",
  gap: 28,
  minWidth: "max-content",
  animation: "cfbDraftTickerScroll 32s linear infinite",
  paddingLeft: "100%",
};


const draftAssetPreviewV40 = {
  border: "1px solid rgba(51,65,85,.85)",
  background: "rgba(2,6,23,.55)",
  color: "rgba(226,232,240,.82)",
  borderRadius: 10,
  padding: 10,
  fontSize: 12,
  fontWeight: 800,
};

const draftBroadcastEyebrowV40 = {
  color: "#93c5fd",
  fontSize: 13,
  fontWeight: 1000,
  letterSpacing: ".18em",
  textTransform: "uppercase",
};

const draftBestAvailableStripV40 = {
  borderRadius: 16,
  padding: 16,
  border: "1px solid rgba(51,65,85,.95)",
  background: "linear-gradient(145deg, rgba(15,23,42,.96), rgba(2,6,23,.99))",
  boxShadow: "0 18px 55px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.04)",
};

const draftBestHeaderV40 = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  marginBottom: 12,
  color: "#dbeafe",
  textTransform: "uppercase",
  letterSpacing: ".08em",
  fontWeight: 1000,
};

const draftBestGridV40 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 12,
};

const draftBestTileV40 = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 8,
  justifyItems: "center",
  alignContent: "center",
  minHeight: 188,
  borderRadius: 18,
  padding: 16,
  color: "#fff",
  border: "1px solid rgba(255,255,255,.16)",
  textAlign: "center",
  cursor: "pointer",
  overflow: "hidden",
};

const draftTileRatingsV40 = {
  color: "rgba(255,255,255,.78)",
  fontWeight: 800,
  position: "relative",
  zIndex: 1,
};

const draftTileScoreV40 = {
  color: "#dbeafe",
  fontWeight: 1000,
  position: "relative",
  zIndex: 1,
};


const draftBestRankV41 = {
  color: "#dbeafe",
  fontWeight: 1000,
};

const draftBestLogoV41 = {
  display: "grid",
  placeItems: "center",
};

const draftBestTeamInfoV41 = {
  display: "grid",
  gap: 4,
  minWidth: 0,
};

const draftBestScoreV41 = {
  justifySelf: "end",
  fontSize: 22,
  fontWeight: 1000,
  color: "#f8fafc",
};

const coachFullWidthTableV41 = {
  ...broadcastCard,
  width: "100%",
  overflow: "hidden",
  borderRadius: 18,
  border: "1px solid rgba(71,85,105,.70)",
  background: "linear-gradient(145deg, rgba(15,23,42,.97), rgba(2,6,23,.99))",
};

const coachStatsTableWrapV41 = {
  width: "100%",
  overflowX: "auto",
  marginTop: 12,
};

const tableSortButtonV41 = {
  background: "transparent",
  border: 0,
  color: "#c4b5fd",
  fontWeight: 1000,
  textTransform: "uppercase",
  letterSpacing: ".08em",
  cursor: "pointer",
  padding: 0,
  whiteSpace: "nowrap",
};


const draftConferencePowerPanelV42 = {
  borderRadius: 16,
  padding: 16,
  border: "1px solid rgba(51,65,85,.95)",
  background: "linear-gradient(145deg, rgba(15,23,42,.96), rgba(2,6,23,.99))",
  boxShadow: "0 18px 55px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.04)",
};

const draftConferencePowerGridV42 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 245px), 1fr))",
  gap: 10,
};

const draftConferencePowerTileV42 = {
  display: "grid",
  gap: 10,
  borderRadius: 14,
  padding: 12,
  background: "rgba(2,6,23,.52)",
  border: "1px solid rgba(148,163,184,.18)",
  color: "#f8fafc",
};

const draftConferencePowerTopV42 = {
  display: "grid",
  gridTemplateColumns: "36px minmax(0,1fr) auto",
  gap: 10,
  alignItems: "center",
};

const draftConferencePowerStatsV42 = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
  color: "rgba(226,232,240,.82)",
  fontSize: 12,
  fontWeight: 850,
};


const draftBestTileV43 = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 8,
  justifyItems: "center",
  alignContent: "center",
  minHeight: 172,
  borderRadius: 18,
  padding: 14,
  color: "#f8fafc",
  border: "1px solid rgba(255,255,255,.08)",
  textAlign: "center",
  cursor: "pointer",
  overflow: "hidden",
  boxShadow: "0 16px 40px rgba(0,0,0,.26), inset 0 1px 0 rgba(255,255,255,.035)",
};

const draftBestRankV43 = {
  justifySelf: "start",
  fontWeight: 1000,
  color: "#dbeafe",
};

const draftBestLogoV43 = {
  width: 48,
  height: 48,
  display: "grid",
  placeItems: "center",
};

const draftBestTeamNameV43 = {
  fontSize: 18,
  lineHeight: 1.05,
  maxWidth: "100%",
};

const draftBestStarsV43 = {
  color: "#facc15",
  fontSize: 15,
  letterSpacing: ".05em",
  minHeight: 20,
};

const draftBestRatingsV43 = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 8,
  width: "100%",
  fontSize: 12,
  color: "rgba(226,232,240,.86)",
};

const draftBestScoreBoxV43 = {
  display: "grid",
  gap: 2,
  borderTop: "1px solid rgba(255,255,255,.12)",
  paddingTop: 8,
  width: "100%",
};

const coachPageV43 = {
  display: "grid",
  gap: 18,
};

const coachHeroV43 = {
  display: "grid",
  gridTemplateColumns: "minmax(0,1.1fr) minmax(420px,.9fr)",
  gap: 20,
  alignItems: "center",
  borderRadius: 20,
  padding: "clamp(22px, 3vw, 36px)",
  border: "1px solid rgba(255,255,255,.16)",
  boxShadow: "0 24px 80px rgba(0,0,0,.46), inset 0 1px 0 rgba(255,255,255,.06)",
  overflow: "hidden",
};

const coachHeroIdentityV43 = {
  display: "grid",
  gridTemplateColumns: "86px minmax(0,1fr)",
  gap: 18,
  alignItems: "center",
  minWidth: 0,
};

const coachNameV43 = {
  margin: "4px 0",
  color: "#fff",
  fontSize: "clamp(42px, 5.8vw, 76px)",
  lineHeight: .9,
  letterSpacing: "-.055em",
  fontWeight: 1000,
  overflowWrap: "anywhere",
};

const coachHeroMetricsV43 = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};

const coachResumeStripV43 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

const coachProfileGridV43 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16,
};

const tableEmptyStateV43 = {
  padding: 24,
  color: "rgba(226,232,240,.84)",
  fontWeight: 800,
};


const wireTextStackV45 = {
  display: "grid",
  gap: 2,
  minWidth: 0,
};

const dashboardTileSubV45 = {
  color: "rgba(226,232,240,.78)",
  fontWeight: 850,
  lineHeight: 1.35,
};

const coachHeroMetricsV45 = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};

const coachHeroMetricV45 = {
  display: "grid",
  gap: 4,
  padding: "14px 12px",
  borderRadius: 14,
  background: "rgba(2,6,23,.48)",
  border: "1px solid rgba(255,255,255,.09)",
  textAlign: "center",
};



const cfpRevealGridV46 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 12,
  margin: "14px 0 24px",
};

const cfpRevealCardV46 = {
  display: "grid",
  gridTemplateColumns: "46px 54px minmax(0,1fr) auto",
  gap: 12,
  alignItems: "center",
  borderRadius: 14,
  padding: 14,
  color: "#f8fafc",
  border: "1px solid rgba(255,255,255,.10)",
  textAlign: "left",
  cursor: "pointer",
  boxShadow: "0 18px 48px rgba(0,0,0,.24), inset 0 1px 0 rgba(255,255,255,.06)",
};

const cfpRankV46 = {
  fontSize: 22,
  fontWeight: 1000,
  color: "#d4af37",
};

const cfpTeamTextV46 = {
  display: "grid",
  gap: 3,
  minWidth: 0,
};

const coachTrophyCaseV46 = {
  ...broadcastCard,
};

const coachTrophyGridV46 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
  marginTop: 14,
};

const coachTrophyTileV46 = {
  minHeight: 118,
  borderRadius: 16,
  display: "grid",
  placeItems: "center",
  textAlign: "center",
  gap: 4,
  padding: 12,
  background: "linear-gradient(145deg, rgba(15,23,42,.95), rgba(2,6,23,.98))",
  border: "1px solid rgba(212,175,55,.20)",
};

const coachMilestoneGridV46 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
  marginTop: 14,
};

const coachMilestoneTileV46 = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  borderRadius: 14,
  padding: 12,
  background: "rgba(255,255,255,.04)",
  border: "1px solid rgba(255,255,255,.08)",
};

const warRoomModePanelV46 = {
  borderRadius: 16,
  padding: 16,
  border: "1px solid rgba(212,175,55,.22)",
  background: "#0f172a",
  boxShadow: "0 18px 55px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.035)",
};

const warRoomModeGridV46 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 12,
};

const warRoomListV46 = {
  borderRadius: 14,
  padding: 12,
  background: "rgba(255,255,255,.035)",
  border: "1px solid rgba(255,255,255,.08)",
};

const warRoomRowV46 = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "34px 32px minmax(0,1fr) auto",
  gap: 8,
  alignItems: "center",
  border: 0,
  borderRadius: 10,
  padding: "9px 8px",
  color: "#f8fafc",
  background: "transparent",
  textAlign: "left",
  cursor: "pointer",
};

const hofRankingGridV46 = {
  display: "grid",
  gap: 10,
  marginTop: 16,
};

const hofRankingCardV46 = {
  display: "grid",
  gridTemplateColumns: "70px minmax(0,1fr) auto",
  gap: 14,
  alignItems: "center",
  borderRadius: 16,
  padding: 16,
  background: "linear-gradient(145deg, rgba(15,23,42,.96), rgba(2,6,23,.99))",
  border: "1px solid rgba(212,175,55,.18)",
};

const hofRankNumberV46 = {
  fontSize: 24,
  fontWeight: 1000,
  color: "#d4af37",
};


const dashboardRankNumberV47 = {
  display: "inline-grid",
  placeItems: "center",
  width: 42,
  height: 34,
  borderRadius: 10,
  background: "linear-gradient(135deg, rgba(212,175,55,.98), rgba(146,111,23,.94))",
  color: "#020617",
  fontStyle: "normal",
  fontWeight: 1000,
  boxShadow: "0 10px 24px rgba(212,175,55,.18), inset 0 1px 0 rgba(255,255,255,.30)",
};

const dashboardTileLinesV47 = {
  display: "grid",
  gap: 3,
};

const cfpGoldTextV47 = {
  color: "#d4af37",
};


const draftConferenceSortBarV48 = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  margin: "12px 0",
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,.035)",
  border: "1px solid rgba(255,255,255,.08)",
  color: "rgba(248,250,252,.82)",
  fontWeight: 900,
  flexWrap: "wrap",
};

const draftConferenceSortSelectV48 = {
  background: "#020617",
  border: "1px solid rgba(255,255,255,.12)",
  color: "#f8fafc",
  borderRadius: 10,
  padding: "10px 12px",
  fontWeight: 900,
  minWidth: 220,
};
