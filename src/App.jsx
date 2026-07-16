import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const NETWORK_REFRESH_MS = 15000;
function playEliteSound(kind="notification",enabled=true) {
  if(!enabled||typeof window==="undefined") return;
  const AudioContextClass=window.AudioContext||window.webkitAudioContext;
  if(!AudioContextClass) return;
  const context=new AudioContextClass();
  const now=context.currentTime;
  const master=context.createGain();
  master.gain.setValueAtTime(.0001,now);
  master.gain.exponentialRampToValueAtTime(kind==="notification"?.12:.045,now+.012);
  master.gain.exponentialRampToValueAtTime(.0001,now+(kind==="notification"?.48:.12));
  master.connect(context.destination);
  const notes=kind==="notification"?[587.33,880,1174.66]:kind==="team"?[196,293.66,392]:[740];
  notes.forEach((frequency,index)=>{
    const oscillator=context.createOscillator();
    const gain=context.createGain();
    const start=now+index*(kind==="notification"?.085:.035);
    oscillator.type=kind==="notification"?"sine":"triangle";
    oscillator.frequency.setValueAtTime(frequency,start);
    if(kind==="notification") oscillator.frequency.exponentialRampToValueAtTime(frequency*1.012,start+.12);
    gain.gain.setValueAtTime(.0001,start);
    gain.gain.exponentialRampToValueAtTime(1,start+.012);
    gain.gain.exponentialRampToValueAtTime(.0001,start+(kind==="notification"?.3:.09));
    oscillator.connect(gain); gain.connect(master); oscillator.start(start); oscillator.stop(start+(kind==="notification"?.32:.1));
  });
  window.setTimeout(()=>context.close?.(),700);
}

const WEEKS = ["Week 0","Week 1","Week 2","Week 3","Week 4","Week 5","Week 6","Week 7","Week 8","Week 9","Week 10","Week 11","Week 12","Week 13","Week 14","Conference Championship Week","Bowl Week 1","Bowl Week 2","Bowl Week 3","National Championship Week"];
function weekIndex(week) { const index = WEEKS.indexOf(week); return index === -1 ? 999 : index; }
const POSITIONS = ["Coach","QB","RB","WR","TE","LT","LG","C","RG","RT","EDGE","DT","SAM","WILL","MIKE","CB","FS","SS","KR","PR","K","P"];
const YEARS = Array.from({ length: 25 }, (_, index) => String(2026 + index));
const ALL_AMERICAN_TYPES = ["First-Team", "Second-Team", "Freshman"];
const AWARD_NAMES = ["Bear Bryant COTY Award","Broyels Award - Top Coordinator","Unitas Golden Arm","Davey O'Brien Award","Edge Rusher of The Year","Fred Biletnikoff Award","Chuck Bednarik Award","Bronko Nagurski Award","Doak Walker Award","John Mackey Award","Lombardi Award","Lou Groza Award","Maxwell Award","Walter Camp Award","Outland Trophy","Paycom Jim Thorpe Award","Ray Guy Award","Rimington Award","Jet Award","Dick Butkus Award","Shaun Alexander Award"];

const EMPTY_RESULT = { season_year: 2029, week: "Week 1", team_1_id: "", team_2_id: "", team_1_user_id: "", team_2_user_id: "", team_1_score: "", team_2_score: "", team_1_rank: "", team_2_rank: "", tags: "User vs User" };
const EMPTY_RECRUITING = { season_year: 2029, rank: "" };

function scoreNumber(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function isoToLocalDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
function localDateTimeInputToIso(value) {
  if (!value) return "";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return "";
  const [, year, month, day, hour, minute] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0, 0);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}
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
  // An unranked opponent is neutral rather than nearly worthless. Ranked wins
  // still scale from elite (#1) to strong (#25) competition.
  if (!number || number < 1 || number > 25) return 4.5;
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
  const games = results.filter((result) => String(result.team_1_id) === String(teamId) || String(result.team_2_id) === String(teamId));
  if (!games.length) return "—";

  const total = games.reduce((sum, result) => {
    const isTeam1 = String(result.team_1_id) === String(teamId);
    const opponentId = isTeam1 ? result.team_2_id : result.team_1_id;
    const opponentRank = isTeam1 ? result.team_2_rank : result.team_1_rank;
    const pointsFor = Number(isTeam1 ? result.team_1_score : result.team_2_score) || 0;
    const pointsAgainst = Number(isTeam1 ? result.team_2_score : result.team_1_score) || 0;
    const resultMargin = pointsFor - pointsAgainst;

    const standingsScore = standingRankDifficulty(opponentId, teams, results);
    const recordScore = recordDifficulty(opponentId, results);
    const rankedScore = pollRankDifficulty(opponentRank);

    const opponentDifficulty = (standingsScore * 0.50) + (recordScore * 0.32) + (rankedScore * 0.18);
    const outcomeAdjustment = resultMargin > 0 ? 1.05 : resultMargin < 0 ? -1.05 : 0;
    const competitivenessAdjustment = Math.max(-1.25, Math.min(1.25, resultMargin / 21));
    return sum + clampSor(opponentDifficulty + outcomeAdjustment + competitivenessAdjustment);
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

function isDraftAvailable(team) {
  if (!team) return false;
  const value = team.draft_available ?? team.is_draft_available ?? team.available_for_draft ?? team.draft_eligible;
  if (value === undefined || value === null || value === "") return true;
  if (typeof value === "boolean") return value;
  return !["false", "no", "n", "0", "banned", "unavailable"].includes(String(value).trim().toLowerCase());
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


const DRAFT_PRESTIGE_OPTIONS = ["", "0.5", "1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5", "5"];
const CONFERENCE_ASSET_NAMES = ["American", "CUSA", "MAC", "Mountain West", "PAC 12", "Sun Belt", "SEC", "ACC", "Big Ten", "Big 12"];

function ConferenceLogoMark({ conference, conferenceAssets = [], size = 42 }) {
  const asset = (conferenceAssets || []).find((row)=>cleanConference(row.conference_name) === cleanConference(conference));
  const url = asset?.logo_url;
  if (!url) {
    return <span style={{ width:size, height:size, borderRadius:12, display:"inline-grid", placeItems:"center", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.10)", color:"#f8fafc", fontWeight:1000, fontSize:Math.max(10, size*.26) }}>{String(conference || "CFB").slice(0,3).toUpperCase()}</span>;
  }
  return <span style={{ width:size, height:size, display:"inline-grid", placeItems:"center" }}><img src={url} alt="" style={{ width:size, height:size, objectFit:"contain", display:"block" }}/></span>;
}

function TeamLogoMark({ team, size = 34, faded = false, plate = false }) {
  const url = team?.logo_url || team?.logo || team?.image_url;
  const baseSize = Number(size) || 34;
  const imageSize = Math.round(baseSize * (plate ? 1.35 : 1.58));

  const wrapStyle = {
    width: baseSize,
    height: baseSize,
    minWidth: baseSize,
    minHeight: baseSize,
    borderRadius: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 0,
    overflow: "visible",
    flexShrink: 0,
    opacity: faded ? .34 : 1,
    position: "relative",
    background: "transparent",
    border: 0,
    boxShadow: "none",
  };

  if (!url) {
    const initials = String(team?.name || "CFB").split(" ").map((part)=>part[0]).join("").slice(0,3).toUpperCase();
    return (
      <span style={{ ...wrapStyle, overflow:"hidden", color:"#fff", fontWeight:1000, fontSize:Math.max(10,baseSize*.30) }}>
        {initials}
      </span>
    );
  }

  return (
    <span style={wrapStyle}>
      <img
        src={url}
        alt=""
        style={{
          width: imageSize,
          height: imageSize,
          objectFit: "contain",
          objectPosition: "center center",
          display: "block",
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          filter: faded ? "grayscale(.12)" : "drop-shadow(0 4px 10px rgba(0,0,0,.40))",
          pointerEvents: "none",
        }}
      />
    </span>
  );
}


function getTeamAbbreviation(team) {
  return team?.abbreviation || team?.abbr || team?.short_name || team?.shortName || String(team?.name || "—").split(" ").map((part)=>part[0]).join("").slice(0,4).toUpperCase();
}

function TeamBroadcastMark({ team, name, size = 38, showName = true, compact = false }) {
  const displayName = name || team?.name || "Team";
  const abbreviation = getTeamAbbreviation(team);
  return (
    <span style={compact ? teamBroadcastCompactV66 : teamBroadcastMarkV66}>
      <TeamLogoMark team={team} size={size}/>
      <span style={teamBroadcastTextV66}>
        <b>{abbreviation}</b>
        {showName && <small>{displayName}</small>}
      </span>
    </span>
  );
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
  return new Set(activeAssignmentsForYear(assignments, year).map((assignment) => String(assignment.team_id)).filter(Boolean));
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

function LeagueLoginGate({ready,session,linkedUser,signIn,signOut,retry,error}) {
  return <><GlobalStyle/><main className="league-login-shell"><section className="league-login-card"><div className="league-login-mark"><span>CFB</span><strong>ELITE</strong><b>27</b></div><div><span className="league-login-kicker">THE PRIVATE HOME OF THE DYNASTY</span><h1>{!ready?"Opening the stadium…":session&&!linkedUser?"Linking your league identity…":"Your league. Your network. Your legacy."}</h1><p>{!ready?"Checking your secure session.":session&&!linkedUser?"Your Discord login is valid. We are matching it to your active CFB Elite membership.":"Sign in with your league Discord account to enter the secured CFB Elite 27 network."}</p></div>{error&&<div className="league-login-error">{error}</div>}<div className="league-login-actions">{!ready?<span className="league-login-loader">LIVE DATABASE</span>:!session?<button onClick={signIn}>Continue with Discord</button>:<><button onClick={retry}>Retry League Link</button><button className="secondary" onClick={signOut}>Sign Out</button></>}</div><footer><span>SECURE LEAGUE ACCESS</span><span>ELITE BOOKS • GAMECENTER • REDZONE • LEAGUE HUB</span></footer></section></main></>;
}

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [currentYear, setCurrentYear] = useState("2029");
  const [currentWeek, setCurrentWeek] = useState("Week 1");
  const [advanceAt, setAdvanceAt] = useState("");
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
  const [conferenceAssets, setConferenceAssets] = useState([]);
  const [rankingSnapshots, setRankingSnapshots] = useState([]);
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
  const [discordSession, setDiscordSession] = useState(null);
  const [linkedDiscordUser, setLinkedDiscordUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [sportsbook, setSportsbook] = useState({
    boards: [], lines: [], picks: [], markets: [], options: [], futurePicks: [],
    badges: [], badgeAwards: [], seasonStandings: [], allTimeStandings: [], champions: [],
  });
  const [sportsbookBusy, setSportsbookBusy] = useState(false);
  const [soundPreferences,setSoundPreferences]=useState(()=>{try{return JSON.parse(localStorage.getItem("cfb-network-preferences")||"{}");}catch{return {};}});

  const teamOptions = useMemo(() => [...teams].sort((a, b) => a.name.localeCompare(b.name)), [teams]);
  const userOptions = useMemo(() => [...users].sort((a, b) => a.discord_username.localeCompare(b.discord_username)), [users]);
  const activeUserOptions = useMemo(() => userOptions.filter((user) => user.is_active !== false), [userOptions]);
  const activeTeamIds = useMemo(
    () => activeTeamIdsForYear(assignments, currentYear),
    [assignments, currentYear]
  );
  const activeTeamOptions = useMemo(() => teamOptions.filter((team) => activeTeamIds.has(String(team.id))), [teamOptions, activeTeamIds]);
  const selectedTeamRaw = activeTab.startsWith("team-") ? teams.find((team) => `team-${team.id}` === activeTab) : null;
  function assignmentForTeam(teamId) {
    return assignments.find((row) => String(row.team_id) === String(teamId) && assignmentActiveForYear(row, currentYear)) ||
      assignments.find((row) => String(row.team_id) === String(teamId) && row.status === "Active") ||
      assignments.find((row) => String(row.team_id) === String(teamId) && row.discord_user_id);
  }
  function assignmentForUser(userId) {
    return assignments.find((row) => String(row.discord_user_id) === String(userId) && assignmentActiveForYear(row, currentYear)) ||
      assignments.find((row) => String(row.discord_user_id) === String(userId) && row.status === "Active") ||
      assignments.find((row) => String(row.discord_user_id) === String(userId) && row.team_id);
  }
  const selectedTeamAssignedCoachId = selectedTeamRaw ? assignmentForTeam(selectedTeamRaw.id)?.discord_user_id : null;
  const selectedTeam = selectedTeamRaw && !selectedTeamAssignedCoachId ? selectedTeamRaw : null;
  const coachProfileUsers = useMemo(() => {
    const removedNames = new Set(["bigben71695", "brassmonkey345", "brassmonkey345.", "brassmonkey345"]);
    const map = new Map();

    [...(userOptions || []), ...(users || [])].forEach((user) => {
      if (!user?.id || !user?.discord_username) return;
      if (user.is_active === false) return;
      const name = String(user.discord_username).trim();
      if (!name || removedNames.has(name.toLowerCase())) return;

      const assignment =
        assignments.find((row) => String(row.discord_user_id) === String(user.id) && assignmentActiveForYear(row, currentYear)) ||
        assignments.find((row) => String(row.discord_user_id) === String(user.id) && row.status === "Active") ||
        assignments.find((row) => String(row.discord_user_id) === String(user.id) && row.team_id);

      const team = teams.find((item) => String(item.id) === String(assignment?.team_id));
      map.set(String(user.id), {
        ...user,
        discord_username: name,
        activeTeamName: team?.name || "",
        activeTeamId: team?.id || null,
      });
    });

    return [...map.values()]
      .sort((a,b)=>{
        const aTeam = a.activeTeamName || "ZZZZZ";
        const bTeam = b.activeTeamName || "ZZZZZ";
        return aTeam.localeCompare(bTeam, undefined, { sensitivity:"base" })
          || String(a.discord_username || "").localeCompare(String(b.discord_username || ""), undefined, { sensitivity:"base" });
      });
  }, [userOptions, users, assignments, teams, currentYear]);

  const selectedCoach =
    activeTab.startsWith("coach-")
      ? (coachProfileUsers.find((user) => `coach-${user.id}` === activeTab) || users.find((user) => `coach-${user.id}` === activeTab) || null)
      : selectedTeamAssignedCoachId
        ? (coachProfileUsers.find((user) => String(user.id) === String(selectedTeamAssignedCoachId)) || users.find((user) => String(user.id) === String(selectedTeamAssignedCoachId)) || null)
        : null;
  const currentYearResults = results.filter((r) => String(r.season_year) === String(currentYear));
  const orderedStandings = standingsOrder.length
    ? standingsOrder.map((id) => standings.find((row) => row.team_id === id)).filter(Boolean)
    : standings;
  function goToTeam(teamId) {
    const assignment = assignmentForTeam(teamId);

    if (assignment?.discord_user_id) {
      setActiveTab(`coach-${assignment.discord_user_id}`);
      return;
    }

    setActiveTab(`team-${teamId}`);
  }
  async function saveCommissionerRankings(order) {
    const activeOrder = order.filter((teamId) => activeTeamIds.has(String(teamId)));
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

  const baseTabs = [["dashboard","Home"],["leagueHub","League Hub"],["schedule","GameCenter"],["eliteBooks","Elite Books"],["redZone","RedZone"],["sportsbookHistory","All-Time Sportsbook"],["myTeam","My Team"],["allTeamsRatings","Teams"],["eloRankings","User ELO"],["powerIndex","All-Time Coach Rankings"],["conferencePower","Conference Power"],["recruitingRankings","Recruiting Rankings"],["dynastyTimeline","Dynasty Timeline"],["dynastyRecords","League Records"],["rivalries","Rivalries"],["h2h","User vs User H2H"],["coachHOF","Coach Hall of Fame"],["playerHOF","Player Hall of Fame"],["allAmericans","All-Americans"],["awards","Awards"],["heismans","Heisman Winners"],["nationalChampions","National Champions"],["commissionerCenter","Commissioner Center"],["sportsbookManager","Elite Books Manager"],["weeklyMatchups","Schedule Manager"],["userManager","League Members"],["assignments","Team Assignments"],["leagueDataCenter","League Data Center"],["resultsManager","Results Manager"],["logoManager","Team Assets"],["draftRoom","CFBElite 27 Draft Room"],...coachProfileUsers.map((user) => [`coach-${user.id}`, user.activeTeamName || user.discord_username])];
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
    const [teamsRes, settingsRes, tabOrderRes, usersRes, assignmentsRes, standingsRes, rankingsRes, resultsRes, weeklyMatchupsRes, draftPicks27Res, draftSettings27Res, aaRes, awardsRes, heismanRes, championsRes, draftRes, playoffRes, recruitingRes, seasonStatsRes, teamStatsRes, historyRes, conferenceAssetsRes] = await Promise.all([
      supabase.from("teams").select("*").order("name"),
      supabase.from("league_settings").select("*").eq("id", 1).single(),
      supabase.from("dashboard_tab_order").select("*").eq("id", 1).single(),
      supabase.from("discord_users").select("id,discord_username,is_active,is_commissioner,discord_avatar_url,sportsbook_seed,sportsbook_notes").order("discord_username"),
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
      supabase.from("conference_assets").select("*").order("conference_name"),
    ]);
    const rankingSnapshotsRes = await supabase
      .from("ranking_snapshots")
      .select("*")
      .order("season_year", { ascending: false })
      .order("week_index", { ascending: false })
      .order("rank");
    const firstError = [teamsRes, settingsRes, tabOrderRes, usersRes, assignmentsRes, standingsRes, rankingsRes, resultsRes, weeklyMatchupsRes, draftPicks27Res, draftSettings27Res, aaRes, awardsRes, heismanRes, championsRes, draftRes, playoffRes, recruitingRes, seasonStatsRes, teamStatsRes, historyRes].find((r) => r.error)?.error;
    if (firstError) setError(firstError.message);
    else {
      if (tabOrderRes.data?.tab_order) setTabOrder(tabOrderRes.data.tab_order);
      if (settingsRes.data) {
        setCurrentYear(String(settingsRes.data.current_year));
        setCurrentWeek(settingsRes.data.current_week);
        setAdvanceAt(settingsRes.data.advance_at || "");
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
      setTeams(teamsRes.data || []); setUsers(usersRes.data || []); setConferenceAssets(conferenceAssetsRes?.data || []);
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
      setRankingSnapshots(rankingSnapshotsRes.error ? [] : (rankingSnapshotsRes.data || []));
    }
    setLoading(false);
  }
  useEffect(() => {
    if (!supabase.auth?.getSession) return undefined;
    let active = true;
    supabase.auth.getSession().then(({ data })=>{
      if (!active) return;
      const nextSession = data?.session || null;
      setDiscordSession(nextSession);
      setAuthReady(true);
      if (nextSession) linkDiscordIdentity(nextSession);
    });
    const authListener = supabase.auth.onAuthStateChange?.((_event, nextSession)=>{
      setDiscordSession(nextSession || null);
      setAuthReady(true);
      if (nextSession) linkDiscordIdentity(nextSession);
      else setLinkedDiscordUser(null);
    });
    return ()=>{ active=false; authListener?.data?.subscription?.unsubscribe?.(); };
  }, []);
  useEffect(()=>{
    if(!discordSession?.user) return;
    loadData(); loadEliteBooksData();
  },[discordSession?.user?.id]);
  useEffect(()=>setAdminUnlocked(Boolean(linkedDiscordUser?.is_commissioner)),[linkedDiscordUser?.is_commissioner]);
  useEffect(()=>{const sync=()=>{try{setSoundPreferences(JSON.parse(localStorage.getItem("cfb-network-preferences")||"{}"));}catch{}};window.addEventListener("cfb-preferences",sync);return()=>window.removeEventListener("cfb-preferences",sync);},[]);
  useEffect(()=>{if(!discordSession?.user?.id)return;const channel=supabase.channel?.(`app-alerts-${discordSession.user.id}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"app_notifications",filter:`auth_user_id=eq.${discordSession.user.id}`},(payload)=>{if(soundPreferences.sound_enabled!==false)playEliteSound("notification",true);setError(payload?.new?.title||"New league notification");}).subscribe();return()=>{if(channel)supabase.removeChannel?.(channel);};},[discordSession?.user?.id,soundPreferences.sound_enabled]);
  useEffect(()=>{if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>{});},[]);
  async function refreshDraftRoomState() {
    const [picksRes, settingsRes] = await Promise.all([
      supabase.from("cfb27_draft_picks").select("*, teams(*), discord_users(discord_username)").order("pick_number"),
      supabase.from("cfb27_draft_settings").select("*").eq("id", 1).single(),
    ]);

    if (!picksRes.error) setDraftPicks27(picksRes.data || []);
    if (!settingsRes.error && settingsRes.data) setDraftSettings27(settingsRes.data);
  }

  useEffect(() => {
    const gameCenterChannel = supabase
      .channel("cfbelite-gamecenter-live-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_results" },
        () => loadData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "weekly_matchups" },
        () => loadData()
      )
      .subscribe();

    // Realtime handles normal updates; this slower poll is only a resilience fallback.
    const gameCenterPollId = window.setInterval(loadData, 60000);

    return () => {
      window.clearInterval(gameCenterPollId);
      supabase.removeChannel(gameCenterChannel);
    };
  }, []);

  useEffect(() => {
    const booksChannel = supabase
      .channel("cfbelite-elite-books-live-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "sportsbook_picks" }, loadEliteBooksData)
      .on("postgres_changes", { event: "*", schema: "public", table: "sportsbook_future_picks" }, loadEliteBooksData)
      .on("postgres_changes", { event: "*", schema: "public", table: "sportsbook_lines" }, loadEliteBooksData)
      .subscribe();
    return ()=>supabase.removeChannel(booksChannel);
  }, []);

  useEffect(() => {
    const draftChannel = supabase
      .channel("cfb27-draft-room-live-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cfb27_draft_settings" },
        () => refreshDraftRoomState()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cfb27_draft_picks" },
        () => refreshDraftRoomState()
      )
      .subscribe();

    // Polling fallback so every browser stays synced even if Supabase Realtime is delayed/disabled.
    const pollId = window.setInterval(refreshDraftRoomState, 15000);

    return () => {
      window.clearInterval(pollId);
      supabase.removeChannel(draftChannel);
    };
  }, []);

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

  async function saveConferenceAsset(conferenceName, field, value) {
    const payload = {
      conference_name: conferenceName,
      [field]: value === "" ? null : value,
      updated_at: new Date().toISOString(),
    };
    const { error: upsertError } = await supabase
      .from("conference_assets")
      .upsert(payload, { onConflict: "conference_name" });
    if (upsertError) setError(`Conference asset save failed: ${upsertError.message}`);
    else setError("");
    await loadData();
  }
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
      advance_at: advanceAt || null,
      updated_at: new Date().toISOString(),
    };

    let { error: upsertError } = await supabase
      .from("league_settings")
      .upsert(payload, { onConflict: "id" });

    if (upsertError && String(upsertError.message || "").toLowerCase().includes("advance_at")) {
      const fallback = { ...payload };
      delete fallback.advance_at;
      const fallbackResult = await supabase.from("league_settings").upsert(fallback, { onConflict: "id" });
      upsertError = fallbackResult.error;
    }

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

  async function loadEliteBooksData() {
    const names = ["sportsbook_boards","sportsbook_lines","sportsbook_pick_directory","sportsbook_future_markets","sportsbook_future_options","sportsbook_future_pick_directory","sportsbook_badges","sportsbook_badge_awards","elite_books_standings","elite_books_all_time_standings","sportsbook_season_champions"];
    try {
      const responses = await Promise.all(names.map((name)=>supabase.from(name).select("*")));
      setSportsbook({
        boards: responses[0].error ? [] : (responses[0].data || []),
        lines: responses[1].error ? [] : (responses[1].data || []),
        picks: responses[2].error ? [] : (responses[2].data || []),
        markets: responses[3].error ? [] : (responses[3].data || []),
        options: responses[4].error ? [] : (responses[4].data || []),
        futurePicks: responses[5].error ? [] : (responses[5].data || []),
        badges: responses[6].error ? [] : (responses[6].data || []),
        badgeAwards: responses[7].error ? [] : (responses[7].data || []),
        seasonStandings: responses[8].error ? [] : (responses[8].data || []),
        allTimeStandings: responses[9].error ? [] : (responses[9].data || []),
        champions: responses[10].error ? [] : (responses[10].data || []),
      });
    } catch (_) {
      // Elite Books remains gracefully unavailable until its migration is installed.
    }
  }

  async function linkDiscordIdentity(session = discordSession) {
    if (!session?.user || typeof supabase.rpc !== "function") return null;
    const { data, error: linkError } = await supabase.rpc("link_my_discord_user");
    if (linkError) { setError(`Discord account link failed: ${linkError.message}`); return null; }
    const row = Array.isArray(data) ? data[0] : data;
    setLinkedDiscordUser(row || null);
    await loadEliteBooksData();
    return row;
  }

  async function signInWithDiscord() {
    if (!supabase.auth?.signInWithOAuth) { setError("Discord sign-in will be available after Supabase Auth is configured."); return; }
    const { error: signInError } = await supabase.auth.signInWithOAuth({ provider: "discord", options: { redirectTo: window.location.origin } });
    if (signInError) setError(`Discord sign-in failed: ${signInError.message}`);
  }

  async function signOutDiscord() {
    if (supabase.auth?.signOut) await supabase.auth.signOut();
    setDiscordSession(null); setLinkedDiscordUser(null);
  }

  async function submitSportsbookPick(lineId, pickType, teamId) {
    if (!discordSession?.user) { setError("Sign in with Discord before making an Elite Books pick."); return false; }
    setSportsbookBusy(true);
    const { data, error: pickError } = await supabase.rpc("submit_elite_books_pick", { p_line_id: lineId, p_pick_type: pickType, p_team_id: String(teamId) });
    setSportsbookBusy(false);
    if (pickError) { setError(`Pick not saved: ${pickError.message}`); return false; }
    const saved=Array.isArray(data)?data[0]:data;
    if (saved) setSportsbook((previous)=>({...previous,
      picks:[...(previous.picks||[]).filter((pick)=>!(String(pick.auth_user_id)===String(saved.auth_user_id)&&String(pick.line_id)===String(saved.line_id)&&String(pick.pick_slot||pick.pick_type)===String(saved.pick_slot||saved.pick_type))),saved],
      lines:(previous.lines||[]).map((line)=>String(line.id)===String(lineId)?{...line,is_frozen:true}:line),
    })); else await loadEliteBooksData();
    setError("Ticket locked in. You can change it until the commissioner closes that matchup."); return true;
  }

  async function submitFuturePick(optionId) {
    if (!discordSession?.user) { setError("Sign in with Discord before making a futures pick."); return false; }
    setSportsbookBusy(true);
    const { data, error: pickError } = await supabase.rpc("submit_elite_books_future", { p_option_id: optionId });
    setSportsbookBusy(false);
    if (pickError) { setError(`Future pick not saved: ${pickError.message}`); return false; }
    const saved=Array.isArray(data)?data[0]:data;
    if (saved) setSportsbook((previous)=>({...previous,futurePicks:[...(previous.futurePicks||[]).filter((pick)=>!(String(pick.auth_user_id)===String(saved.auth_user_id)&&String(pick.market_id)===String(saved.market_id))),saved]})); else await loadEliteBooksData();
    setError("Futures selection saved to your Discord profile."); return true;
  }

  async function generateSportsbookBoard() {
    setSportsbookBusy(true);
    const { error: generationError } = await supabase.rpc("generate_elite_books_board", { p_season: Number(currentYear), p_week: currentWeek });
    setSportsbookBusy(false);
    if (generationError) { setError(`Board generation failed: ${generationError.message}`); return false; }
    setError(`${currentYear} ${currentWeek} Elite Books board generated.`); await loadEliteBooksData(); return true;
  }

  async function seedSportsbookFutures() {
    setSportsbookBusy(true);
    const { error: seedError } = await supabase.rpc("seed_elite_books_futures", { p_season: Number(currentYear), p_lock_at: advanceAt || null });
    setSportsbookBusy(false);
    if (seedError) { setError(`Futures setup failed: ${seedError.message}`); return false; }
    setError(`${currentYear} futures markets created.`); await loadEliteBooksData(); return true;
  }

  async function settleFutureMarket(marketId, optionId) {
    const { error: settleError } = await supabase.rpc("settle_elite_books_future", { p_market_id: marketId, p_option_id: optionId });
    if (settleError) { setError(`Future settlement failed: ${settleError.message}`); return false; }
    setError("Futures market settled."); await loadEliteBooksData(); return true;
  }

  async function setMatchupBettingLock(lineId, locked) {
    setSportsbookBusy(true);
    const { error: lockError }=await supabase.rpc("set_elite_books_matchup_lock",{p_line_id:lineId,p_locked:locked,p_reason:locked?"Game started":""});
    setSportsbookBusy(false);
    if(lockError){setError(`Matchup lock failed: ${lockError.message}`);return false;}
    setError(locked?"Betting locked for that matchup.":"Betting reopened for that matchup.");
    await loadEliteBooksData(); return true;
  }

  async function voidSportsbookMatchup(lineId) {
    const reason=window.prompt("Why is this matchup being voided?","Game was not played");
    if(!reason?.trim()) return false;
    if(!window.confirm("Void every wager on this matchup for zero points? This cannot be reopened from the dashboard.")) return false;
    setSportsbookBusy(true);
    const { error: voidError }=await supabase.rpc("void_elite_books_matchup",{p_line_id:lineId,p_reason:reason.trim()});
    setSportsbookBusy(false);
    if(voidError){setError(`Matchup void failed: ${voidError.message}`);return false;}
    setError("Matchup voided. All wagers were closed with zero points.");
    await loadEliteBooksData(); return true;
  }

  async function updateSportsbookSeed(userId, seed) {
    const value=Math.max(1,Math.min(99,Number(seed)||50));
    const { error: seedError }=await supabase.rpc("set_elite_books_seed",{p_user_id:String(userId),p_seed:value});
    if(seedError){setError(`Power seed save failed: ${seedError.message}`);return false;}
    setUsers((rows)=>rows.map((row)=>String(row.id)===String(userId)?{...row,sportsbook_seed:value}:row));
    setError("Preseason sportsbook power seed saved."); return true;
  }
  async function updateSportsbookTeamSeed(teamId, seed) {
    const value=Math.max(1,Math.min(99,Number(seed)||70));
    const { error: seedError }=await supabase.rpc("set_elite_books_team_seed",{p_team_id:String(teamId),p_seed:value});
    if(seedError){setError(`Team rating save failed: ${seedError.message}`);return false;}
    setTeams((rows)=>rows.map((team)=>String(team.id)===String(teamId)?{...team,sportsbook_team_seed:value}:team));
    setError("Preseason team overall saved."); return true;
  }
  async function addDiscordUser(discordUsername) {
    const name = String(discordUsername || "").trim();
    if (!name) { setError("Enter a Discord username first."); return false; }
    const duplicate = users.some((user)=>String(user.discord_username || "").trim().toLowerCase() === name.toLowerCase());
    if (duplicate) { setError(`${name} is already in the Discord user list.`); return false; }
    let insertResult = await supabase.from("discord_users").insert({ discord_username:name, is_active:true });
    if (insertResult.error && String(insertResult.error.message || "").toLowerCase().includes("is_active")) {
      insertResult = await supabase.from("discord_users").insert({ discord_username:name });
    }
    if (insertResult.error) { setError(`Discord user add failed: ${insertResult.error.message}`); return false; }
    setError(`Added Discord user ${name}.`);
    await loadData();
    return true;
  }
  async function renameDiscordUser(userId, discordUsername) {
    const name = String(discordUsername || "").trim();
    if (!userId || !name) { setError("A valid Discord username is required."); return false; }
    const duplicate = users.some((user)=>String(user.id)!==String(userId) && String(user.discord_username || "").trim().toLowerCase() === name.toLowerCase());
    if (duplicate) { setError(`${name} is already in the Discord user list.`); return false; }
    const { error: updateError } = await supabase.from("discord_users").update({ discord_username:name }).eq("id", userId);
    if (updateError) { setError(`Discord user rename failed: ${updateError.message}`); return false; }
    setError(`Updated Discord username to ${name}.`);
    await loadData();
    return true;
  }
  async function setDiscordUserActive(userId, isActive) {
    const { error: updateError } = await supabase.from("discord_users").update({ is_active:Boolean(isActive) }).eq("id", userId);
    if (updateError) { setError(`Discord user status update failed: ${updateError.message}. Run the v2 Supabase migration first.`); return false; }
    setError(`Discord user ${isActive ? "activated" : "deactivated"}.`);
    await loadData();
    return true;
  }
  async function setDiscordCommissionerStatus(userId, enabled) {
    const { data, error: commissionerError }=await supabase.rpc("set_elite_books_commissioner",{p_user_id:String(userId),p_enabled:Boolean(enabled)});
    if(commissionerError){setError(`Commissioner status update failed: ${commissionerError.message}`);return false;}
    const updated=Array.isArray(data)?data[0]:data;
    setUsers((rows)=>rows.map((user)=>String(user.id)===String(userId)?{...user,is_commissioner:Boolean(enabled)}:user));
    if(String(linkedDiscordUser?.id)===String(userId))setLinkedDiscordUser((user)=>({...user,...updated,is_commissioner:Boolean(enabled)}));
    setError(`${updated?.discord_username||"Discord user"} ${enabled?"is now a commissioner":"is no longer a commissioner"}.`);
    return true;
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
    const skipped = [];
    let importWeek = currentWeek;
    const existingKeys = new Set((weeklyMatchups || []).map((row)=>{
      const pair = [String(row.team_1_id), String(row.team_2_id)].sort().join("::");
      return `${row.season_year}::${row.week}::${pair}`;
    }));

    const aliases = new Map([
      ["ecupirates", "eastcarolinapirates"],
      ["fauowls", "floridaatlanticowls"],
      ["jmudukes", "jamesmadisondukes"],
      ["mtsublueraiders", "middletennesseeblueraiders"],
      ["delawarebluehens", "delawarefightinbluehens"],
      ["utahstaggies", "utahstateaggies"],
      ["jacksonvillestgamecocks", "jacksonvillestategamecocks"],
    ]);
    const aliasValue = (value)=>aliases.get(normalizeName(value)) || normalizeName(value);
    const findTeam = (text) => {
      const normalized = aliasValue(text);
      const exact = teamOptions.find((team)=>aliasValue(team.name)===normalized);
      if (exact) return exact;
      return teamOptions.find((team)=>normalized.includes(aliasValue(team.name)) || aliasValue(team.name).includes(normalized));
    };
    const findUser = (text) => {
      const normalized = normalizeName(text);
      return activeUserOptions.find((user) => normalized.includes(normalizeName(user.discord_username)) || normalizeName(user.discord_username).includes(normalized));
    };

    lines.forEach((line) => {
      const weekHeading = line.match(/^week\s+(\d+|conference championship|bowl\s+\d+|national championship)\s*:?-?$/i);
      if (weekHeading) {
        const value = weekHeading[1];
        if (/^\d+$/.test(value)) importWeek = `Week ${Number(value)}`;
        else if (/^conference/i.test(value)) importWeek = "Conference Championship Week";
        else if (/^bowl/i.test(value)) importWeek = `Bowl Week ${Number(value.replace(/\D/g, ""))}`;
        else importWeek = "National Championship Week";
        return;
      }
      const cleanLine = line
        .replace(/\s+at\s+/i, " vs ")
        .replace(/\s+@\s+/i, " vs ")
        .replace(/\s+v\.\s+/i, " vs ")
        .replace(/\s+versus\s+/i, " vs ");
      const [left, right] = cleanLine.split(/\s+vs\s+/i).map((part) => part?.trim());
      if (!left || !right) { skipped.push(line); return; }

      const team1 = findTeam(left);
      const team2 = findTeam(right);
      const user1 = findUser(left);
      const user2 = findUser(right);

      if (team1 && team2) {
        const seasonYear = Number(currentYear);
        const pair = [String(team1.id), String(team2.id)].sort().join("::");
        const key = `${seasonYear}::${importWeek}::${pair}`;
        if (existingKeys.has(key)) return;
        existingKeys.add(key);
        payload.push({
          season_year: Number(currentYear),
          week: importWeek,
          team_1_id: team1.id,
          team_2_id: team2.id,
          team_1_user_id: user1?.id || activeCoachForTeam(team1.id, assignments)?.discord_user_id || null,
          team_2_user_id: user2?.id || activeCoachForTeam(team2.id, assignments)?.discord_user_id || null,
        });
      } else skipped.push(line);
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
    setError(`Imported ${payload.length} weekly matchup${payload.length === 1 ? "" : "s"}${skipped.length ? ` • ${skipped.length} line${skipped.length===1?"":"s"} could not be matched` : ""}.`);
    await loadData();
  }

  async function saveCurrentRankingSnapshot() {
    const seasonResults = results.filter((row)=>String(row.season_year)===String(currentYear));
    const rows = computerRankingRows(activeTeamOptions, seasonResults, assignments, users);
    if (!rows.length) { setError("No active-team rankings are available to snapshot."); return false; }
    const payload = rows.map((row)=>({
      season_year:Number(currentYear),
      week:currentWeek,
      week_index:weekIndex(currentWeek),
      team_id:row.team.id,
      rank:row.rank,
      rating:Number(row.rating || 0),
      wins:Number(row.wins || 0),
      losses:Number(row.losses || 0),
      created_at:new Date().toISOString(),
    }));
    const { error: snapshotError } = await supabase
      .from("ranking_snapshots")
      .upsert(payload, { onConflict:"season_year,week,team_id" });
    if (snapshotError) { setError(`Ranking snapshot failed: ${snapshotError.message}. Run the v2 Supabase migration first.`); return false; }
    setError(`Saved ${currentYear} ${currentWeek} ranking snapshot.`);
    await loadData();
    return true;
  }

  function unlockAdmin() {
    setError("Commissioner access now requires a signed-in Discord account with commissioner status.");
  }

  if(!authReady||!discordSession||!linkedDiscordUser) return <LeagueLoginGate ready={authReady} session={discordSession} linkedUser={linkedDiscordUser} signIn={signInWithDiscord} signOut={signOutDiscord} retry={()=>linkDiscordIdentity(discordSession)} error={error}/>;

  return <><GlobalStyle/><div style={page}><div style={container}><Header loading={loading} reload={loadData}/>{error && <div style={isErrorMessage(error) ? errorBox : successBox}>{error}</div>}<TabBar tabs={tabs} activeTab={activeTab} setActiveTab={setActiveTab} draggedTab={draggedTab} setDraggedTab={setDraggedTab} reorderTabs={reorderTabs} adminUnlocked={adminUnlocked} adminCodeInput={adminCodeInput} setAdminCodeInput={setAdminCodeInput} unlockAdmin={unlockAdmin} teams={teamOptions} assignments={assignments} currentYear={currentYear} users={userOptions} discordSession={discordSession} linkedDiscordUser={linkedDiscordUser} signInWithDiscord={signInWithDiscord} signOutDiscord={signOutDiscord} soundPreferences={soundPreferences}/>
    {activeTab === "draftRoom" && <DraftRoom teams={teamOptions} users={userOptions} picks={draftPicks27} settings={draftSettings27} conferenceAssets={conferenceAssets} startClock={startDraftClock} pauseClock={pauseDraftClock} resumeClock={resumeDraftClock} announcePick={announceDraftPick} revealPick={revealDraftPick} undoPick={undoDraftPick}/>}     
    {activeTab === "dashboard" && <DashboardV2 teams={activeTeamOptions} users={userOptions} assignments={assignments} results={currentYearResults} allResults={results} weeklyMatchups={weeklyMatchups} conferenceAssets={conferenceAssets} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting} teamSeasonStats={teamSeasonStats} currentYear={currentYear} currentWeek={currentWeek} advanceAt={advanceAt} rankingSnapshots={rankingSnapshots} adminUnlocked={adminUnlocked} sportsbook={sportsbook} linkedDiscordUser={linkedDiscordUser} setCurrentYear={(value)=>{setCurrentYear(value); setNewResult((prev)=>({...prev, season_year: Number(value)})); setNewWeeklyMatchup((prev)=>({...prev,season_year:Number(value)}));}} setCurrentWeek={(value)=>{setCurrentWeek(value); setNewResult((prev)=>({...prev, week: value})); setNewWeeklyMatchup((prev)=>({...prev,week:value}));}} saveSettings={saveLeagueSettings} goToTeam={goToTeam} setActiveTab={setActiveTab}/>} 
    {activeTab === "leagueHub" && <LeagueHub discordSession={discordSession} linkedDiscordUser={linkedDiscordUser} users={userOptions} teams={activeTeamOptions} assignments={assignments} currentYear={currentYear} setActiveTab={setActiveTab} setError={setError}/>} 
    {activeTab === "redZone" && <RedZoneCenter discordSession={discordSession} linkedDiscordUser={linkedDiscordUser} users={userOptions} teams={activeTeamOptions} assignments={assignments} currentYear={currentYear} setError={setError}/>} 
    {activeTab === "eliteBooks" && <EliteBooks sportsbook={sportsbook} teams={activeTeamOptions} users={userOptions} assignments={assignments} results={results} weeklyMatchups={weeklyMatchups} conferenceAssets={conferenceAssets} currentYear={currentYear} currentWeek={currentWeek} advanceAt={advanceAt} discordSession={discordSession} linkedDiscordUser={linkedDiscordUser} busy={sportsbookBusy} signInWithDiscord={signInWithDiscord} signOutDiscord={signOutDiscord} submitPick={submitSportsbookPick} submitFuture={submitFuturePick} setActiveTab={setActiveTab}/>} 
    {activeTab === "sportsbookHistory" && <EliteBooksHistory sportsbook={sportsbook} users={userOptions} currentYear={currentYear} setActiveTab={setActiveTab}/>} 
    {activeTab === "myTeam" && <MyTeamHub linkedDiscordUser={linkedDiscordUser} discordSession={discordSession} teams={activeTeamOptions} users={userOptions} assignments={assignments} results={results} weeklyMatchups={weeklyMatchups} sportsbook={sportsbook} currentYear={currentYear} currentWeek={currentWeek} signInWithDiscord={signInWithDiscord} setActiveTab={setActiveTab}/>} 
    {activeTab === "schedule" && <GameCenterV2 teams={teamOptions} users={userOptions} assignments={assignments} weeklyMatchups={weeklyMatchups} results={results} currentYear={currentYear} currentWeek={currentWeek} conferenceAssets={conferenceAssets} adminUnlocked={adminUnlocked} loadData={loadData} setActiveTab={setActiveTab}/>}
    {activeTab === "eloRankings" && <EloRankings users={userOptions} teams={teamOptions} assignments={assignments} results={results}/>}    
    {activeTab === "dynastyRecords" && <DynastyRecords users={userOptions} teams={teamOptions} assignments={assignments} results={results} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting} seasonPlayerStats={seasonPlayerStats} teamSeasonStats={teamSeasonStats}/>}    
{activeTab === "rivalries" && <Rivalries users={userOptions} teams={teamOptions} assignments={assignments} results={results}/>}    
    {activeTab === "powerIndex" && <DynastyPowerIndex users={userOptions} teams={teamOptions} assignments={assignments} results={results} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting}/>}
    {activeTab === "commissionerCenter" && (adminUnlocked ? <CommissionerCenterV2 currentYear={currentYear} currentWeek={currentWeek} advanceAt={advanceAt} setAdvanceAt={setAdvanceAt} setActiveTab={setActiveTab} saveLeagueSettings={saveLeagueSettings} saveCurrentRankingSnapshot={saveCurrentRankingSnapshot} loadData={loadData} teams={teamOptions} users={userOptions} assignments={assignments} results={results} weeklyMatchups={weeklyMatchups} awards={awards} allAmericans={allAmericans} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting}/> : <AdminLocked adminCodeInput={adminCodeInput} setAdminCodeInput={setAdminCodeInput} unlockAdmin={unlockAdmin}/>) }    
    {activeTab === "sportsbookManager" && (adminUnlocked ? <EliteBooksManager sportsbook={sportsbook} users={userOptions} teams={activeTeamOptions} assignments={assignments} currentYear={currentYear} currentWeek={currentWeek} advanceAt={advanceAt} busy={sportsbookBusy} linkedDiscordUser={linkedDiscordUser} generateBoard={generateSportsbookBoard} seedFutures={seedSportsbookFutures} settleFuture={settleFutureMarket} setMatchupLock={setMatchupBettingLock} voidMatchup={voidSportsbookMatchup} updateSeed={updateSportsbookSeed} updateTeamSeed={updateSportsbookTeamSeed} loadData={loadEliteBooksData}/> : <AdminLocked adminCodeInput={adminCodeInput} setAdminCodeInput={setAdminCodeInput} unlockAdmin={unlockAdmin}/>)}
    {activeTab === "logoManager" && <LogoManager teams={teamOptions} updateRow={updateRow} conferenceAssets={conferenceAssets} saveConferenceAsset={saveConferenceAsset}/>}    
    {activeTab === "allTeamsRatings" && <AllTeamsRatings teams={teamOptions}/>}    
    {activeTab === "leagueDataCenter" && <LeagueDataCenter teams={teamOptions} users={userOptions} assignments={assignments} results={results} currentYear={currentYear} currentWeek={currentWeek} setError={setError} loadData={loadData}/>}
    {activeTab === "conferencePower" && <ConferencePowerRankings teams={activeTeamOptions} users={userOptions} assignments={assignments} results={currentYearResults} allResults={results} conferenceAssets={conferenceAssets} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting}/>}    
    {activeTab === "weeklyMedia" && <WeeklyMedia teams={activeTeamOptions} users={userOptions} assignments={assignments} results={currentYearResults} allResults={results} weeklyMatchups={weeklyMatchups} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting} currentYear={currentYear} currentWeek={currentWeek}/>}    
    {activeTab === "weeklyMatchups" && (adminUnlocked ? <ScheduleManagerV2 rows={weeklyMatchups} newMatchup={newWeeklyMatchup} setNewMatchup={setNewWeeklyMatchup} teams={activeTeamOptions} users={activeUserOptions} assignments={assignments} currentYear={currentYear} currentWeek={currentWeek} addMatchup={addWeeklyMatchup} deleteRow={deleteRow} matchupImportText={matchupImportText} setMatchupImportText={setMatchupImportText} importWeeklyMatchups={importWeeklyMatchups} loadData={loadData} setError={setError}/> : <AdminLocked adminCodeInput={adminCodeInput} setAdminCodeInput={setAdminCodeInput} unlockAdmin={unlockAdmin}/>) }    
    {activeTab === "userManager" && (adminUnlocked ? <UserManagerV2 users={userOptions} assignments={assignments} teams={teamOptions} linkedDiscordUser={linkedDiscordUser} addDiscordUser={addDiscordUser} renameDiscordUser={renameDiscordUser} setDiscordUserActive={setDiscordUserActive} setDiscordCommissionerStatus={setDiscordCommissionerStatus}/> : <AdminLocked adminCodeInput={adminCodeInput} setAdminCodeInput={setAdminCodeInput} unlockAdmin={unlockAdmin}/>) }
{activeTab === "recruitingRankings" && <RecruitingRankings rows={recruiting} teams={teamOptions} users={userOptions} assignments={assignments} currentYear={currentYear} loadData={loadData} deleteRow={deleteRow} updateRow={updateRow}/>}    
    {activeTab === "dynastyTimeline" && <DynastyTimeline results={results} teams={teamOptions} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting}/>}
    {activeTab === "coachHOF" && <CoachHallOfFame users={userOptions} teams={teamOptions} assignments={assignments} results={results} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting}/>}    
    {activeTab === "playerHOF" && <PlayerHallOfFame teams={teamOptions} assignments={assignments} results={results} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions}/>}    
    {activeTab === "assignments" && (adminUnlocked ? <Assignments rows={assignments} teams={teamOptions} users={activeUserOptions} currentYear={currentYear} addAssignment={addAssignment} updateRow={updateRow} deleteRow={deleteRow} drafts={draftAssignments} setDrafts={setDraftAssignments} saveDraft={saveDraft} getDraft={getDraft} teamChange={teamChange} setTeamChange={setTeamChange} changeUserTeam={changeUserTeam}/> : <AdminLocked adminCodeInput={adminCodeInput} setAdminCodeInput={setAdminCodeInput} unlockAdmin={unlockAdmin}/>) }    
    {activeTab === "resultsManager" && <ResultsManager rows={results} teams={teamOptions} users={userOptions} assignments={assignments} updateRow={updateRow} deleteRow={deleteRow}/>}    
    {activeTab === "h2h" && <H2H results={results} search={search.h2h} setSearch={(v)=>setSearch({...search,h2h:v})}/>}    
    {activeTab === "allAmericans" && <AllAmericans rows={allAmericans} teams={teamOptions} addRow={addAA} updateRow={updateRow} deleteRow={deleteRow} rankings={[]} drafts={draftAllAmericans} setDrafts={setDraftAllAmericans} saveDraft={saveDraft} getDraft={getDraft}/>}    
    {activeTab === "awards" && <Awards rows={awards} teams={teamOptions} addRow={addAward} updateRow={updateRow} deleteRow={deleteRow} rankings={[]} drafts={draftAwards} setDrafts={setDraftAwards} saveDraft={saveDraft} getDraft={getDraft}/>}    
    {activeTab === "heismans" && (adminUnlocked ? <Heismans rows={heismans} teams={teamOptions} addRow={addHeisman} updateRow={updateRow} deleteRow={deleteRow} drafts={draftHeismans} setDrafts={setDraftHeismans} saveDraft={saveDraft} getDraft={getDraft}/> : <TrophyGalleryV2 title="Heisman Winners" eyebrow="COLLEGE FOOTBALL'S HIGHEST HONOR" rows={heismans} teams={teamOptions} users={userOptions}/>)}    
    {activeTab === "nationalChampions" && (adminUnlocked ? <NationalChampions rows={nationalChampions} teams={teamOptions} users={userOptions} addRow={addNationalChampion} updateRow={updateRow} deleteRow={deleteRow} drafts={draftChampions} setDrafts={setDraftChampions} saveDraft={saveDraft} getDraft={getDraft}/> : <TrophyGalleryV2 title="National Champions" eyebrow="CFBELITE TITLE HISTORY" rows={nationalChampions} teams={teamOptions} users={userOptions} champions/>)}        
    {selectedTeam && <TeamPage team={selectedTeam} standings={standings.find((row)=>row.team_id===selectedTeam.id)} results={currentYearResults} allResults={results} teams={teamOptions} assignments={assignments} allAmericans={allAmericans} awards={awards} heismans={heismans} recruiting={recruiting} historyRows={historyRows} addRecruiting={addRecruiting} addHistory={addHistory} updateRow={updateRow} deleteRow={deleteRow} newRecruiting={newRecruiting} setNewRecruiting={setNewRecruiting} newHistory={newHistory} setNewHistory={setNewHistory}/>}    
    {selectedCoach && <CoachProfile user={selectedCoach} users={userOptions} teams={teamOptions} assignments={assignments} results={results} weeklyMatchups={weeklyMatchups} currentYear={currentYear} currentWeek={currentWeek} rankingSnapshots={rankingSnapshots} allAmericans={allAmericans} awards={awards} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting} seasonPlayerStats={seasonPlayerStats} teamSeasonStats={teamSeasonStats} sportsbook={sportsbook}/>}    
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
  return <section style={card}><h2 style={sectionTitle}>All Time Head Coach Rankings</h2><p style={mutedText}>All-time head coach greatness metric: ELO, win percentage, national titles, conference titles, bowl record, All-Americans, awards, Heismans, and total wins.</p><Table headers={["#", "Coach", "DPI", "ELO", "Record", "Nattys", "Conf", "Bowl", "AA", "Awards"]}>{rows.map((row,index)=><tr key={row.userId} style={trStyle}><td style={rankCell}>#{index+1}</td><td style={teamCell}>{row.discord}</td><td style={scoreCell}>{row.dpi}</td><td style={td}>{row.elo}</td><td style={td}>{row.wins}-{row.losses}</td><td style={td}>{row.nattys}</td><td style={td}>{row.confTitles}</td><td style={td}>{row.bowlWins}-{row.bowlLosses}</td><td style={td}>{row.allAmericans}</td><td style={td}>{row.awards}</td></tr>)}</Table></section>;
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


function scheduledResultFor(matchup, results = [], seasonYear = null) {
  return results.find((game)=>
    (!seasonYear || String(game.season_year)===String(seasonYear)) &&
    String(game.week)===String(matchup.week) &&
    (
      (String(game.team_1_id)===String(matchup.team_1_id) && String(game.team_2_id)===String(matchup.team_2_id)) ||
      (String(game.team_1_id)===String(matchup.team_2_id) && String(game.team_2_id)===String(matchup.team_1_id))
    )
  ) || null;
}

function assignedCoachName(teamId, explicitUserId, users = [], assignments = [], year = null) {
  const assignment = assignments.find((row)=>String(row.team_id)===String(teamId) && (!year || assignmentActiveForYear(row, year))) ||
    assignments.find((row)=>String(row.team_id)===String(teamId) && row.status==="Active");
  const userId = explicitUserId || assignment?.discord_user_id;
  return users.find((user)=>String(user.id)===String(userId))?.discord_username || "User TBD";
}

function previousRankingMap(rankingSnapshots = [], currentYear, currentWeek) {
  const currentIndex = weekIndex(currentWeek);
  const priorWeeks = rankingSnapshots
    .filter((row)=>String(row.season_year)===String(currentYear) && Number(row.week_index)<currentIndex)
    .map((row)=>Number(row.week_index));
  if (!priorWeeks.length) return new Map();
  const priorIndex = Math.max(...priorWeeks);
  return new Map(rankingSnapshots
    .filter((row)=>String(row.season_year)===String(currentYear) && Number(row.week_index)===priorIndex)
    .map((row)=>[String(row.team_id), Number(row.rank)]));
}

function RankingMovement({ currentRank, previousRank }) {
  if (!previousRank || previousRank===currentRank) return <span style={v2MovementEven}>—</span>;
  const change = previousRank-currentRank;
  return <span style={change>0 ? v2MovementUp : v2MovementDown}>{change>0 ? `▲ ${change}` : `▼ ${Math.abs(change)}`}</span>;
}

function useLiveClock(interval = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(()=>{
    const timer = window.setInterval(()=>setNow(Date.now()), interval);
    return ()=>window.clearInterval(timer);
  }, [interval]);
  return now;
}

function countdownParts(target, now = Date.now()) {
  if (!target) return null;
  const diff = new Date(target).getTime()-now;
  if (!Number.isFinite(diff)) return null;
  if (diff<=0) return { expired:true, label:"Advance window reached" };
  const totalMinutes = Math.floor(diff/60000);
  const days = Math.floor(totalMinutes/1440);
  const hours = Math.floor((totalMinutes%1440)/60);
  const minutes = totalMinutes%60;
  return { expired:false, days, hours, minutes, label:`${days ? `${days}d ` : ""}${hours}h ${minutes}m` };
}

function sanitizeFileName(value) {
  return String(value || "cfbelite").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "");
}

function loadCanvasImage(url) {
  return new Promise((resolve)=>{
    if (!url) return resolve(null);
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = ()=>resolve(image);
    image.onerror = ()=>resolve(null);
    image.src = url;
  });
}

function drawCoverLogo(ctx, image, x, y, size, fallback) {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,.08)";
  ctx.beginPath(); ctx.roundRect(x, y, size, size, 28); ctx.fill();
  if (image) {
    const ratio = Math.min((size-28)/image.width, (size-28)/image.height);
    const width = image.width*ratio;
    const height = image.height*ratio;
    ctx.drawImage(image, x+(size-width)/2, y+(size-height)/2, width, height);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 44px Inter, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(fallback, x+size/2, y+size/2);
  }
  ctx.restore();
}

async function downloadMatchupGraphic({ team1, team2, user1, user2, result, week, seasonYear, label = "GAMECENTER" }) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200; canvas.height = 675;
  const ctx = canvas.getContext("2d");
  const primary1 = getTeamPrimary(team1);
  const primary2 = getTeamPrimary(team2);
  const gradient = ctx.createLinearGradient(0,0,1200,675);
  gradient.addColorStop(0, primary1); gradient.addColorStop(.48, "#020617"); gradient.addColorStop(1, primary2);
  ctx.fillStyle = gradient; ctx.fillRect(0,0,1200,675);
  ctx.fillStyle = "rgba(2,6,23,.36)"; ctx.fillRect(0,0,1200,675);
  ctx.fillStyle = "#facc15"; ctx.fillRect(0,0,1200,12);
  ctx.textAlign = "center";
  ctx.fillStyle = "#facc15"; ctx.font = "900 24px Inter, Arial"; ctx.fillText(`CFBELITE 27 • ${label}`,600,60);
  ctx.fillStyle = "#ffffff"; ctx.font = "900 38px Inter, Arial"; ctx.fillText(`${seasonYear} • ${week}`,600,108);
  const [logo1, logo2] = await Promise.all([loadCanvasImage(getHelmetUrl(team1)), loadCanvasImage(getHelmetUrl(team2))]);
  drawCoverLogo(ctx, logo1, 190, 145, 180, getTeamAbbreviation(team1).slice(0,3));
  drawCoverLogo(ctx, logo2, 830, 145, 180, getTeamAbbreviation(team2).slice(0,3));
  const score1 = result ? scoreForScheduledTeam(result, team1?.id) : null;
  const score2 = result ? scoreForScheduledTeam(result, team2?.id) : null;
  ctx.fillStyle = "#ffffff"; ctx.font = "900 36px Inter, Arial";
  ctx.fillText(team1?.name || "Team 1",280,385); ctx.fillText(team2?.name || "Team 2",920,385);
  ctx.fillStyle = "#cbd5e1"; ctx.font = "700 22px Inter, Arial";
  ctx.fillText(user1 || "User TBD",280,425); ctx.fillText(user2 || "User TBD",920,425);
  ctx.fillStyle = "#facc15"; ctx.font = "1000 82px Inter, Arial";
  ctx.fillText(result ? `${score1}–${score2}` : "VS",600,365);
  if (result) {
    ctx.fillStyle = "#facc15"; ctx.font = "900 25px Inter, Arial"; ctx.fillText("FINAL",600,425);
  }
  ctx.fillStyle = "rgba(255,255,255,.76)"; ctx.font = "700 20px Inter, Arial";
  ctx.fillText("CFBElite 27 Online Dynasty",600,620);
  const blob = await new Promise((resolve)=>canvas.toBlob(resolve,"image/png"));
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href=url;
  link.download=`${sanitizeFileName(`${week}-${team1?.name}-vs-${team2?.name}`)}.png`;
  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  return true;
}

async function downloadRankingsGraphic(rankings, seasonYear, week) {
  const canvas=document.createElement("canvas"); canvas.width=1200; canvas.height=1200;
  const ctx=canvas.getContext("2d");
  const gradient=ctx.createLinearGradient(0,0,1200,1200); gradient.addColorStop(0,"#2e1065"); gradient.addColorStop(.55,"#0f172a"); gradient.addColorStop(1,"#020617");
  ctx.fillStyle=gradient; ctx.fillRect(0,0,1200,1200); ctx.fillStyle="#facc15"; ctx.fillRect(0,0,1200,14);
  ctx.fillStyle="#facc15"; ctx.font="900 28px Inter, Arial"; ctx.fillText("CFBELITE 27",70,72);
  ctx.fillStyle="#ffffff"; ctx.font="1000 58px Inter, Arial"; ctx.fillText("AUTOMATIC TOP 10",70,140);
  ctx.fillStyle="#cbd5e1"; ctx.font="700 24px Inter, Arial"; ctx.fillText(`${seasonYear} • ${week}`,70,182);
  rankings.slice(0,10).forEach((row,index)=>{
    const y=250+index*86; ctx.fillStyle=index===0?"rgba(250,204,21,.18)":"rgba(255,255,255,.055)"; ctx.fillRect(60,y-50,1080,68);
    ctx.fillStyle="#facc15"; ctx.font="1000 34px Inter, Arial"; ctx.fillText(`#${index+1}`,82,y-6);
    ctx.fillStyle="#ffffff"; ctx.font="900 29px Inter, Arial"; ctx.fillText(row.teamName,175,y-7);
    ctx.textAlign="right"; ctx.fillStyle="#cbd5e1"; ctx.font="800 23px Inter, Arial"; ctx.fillText(`${row.wins}-${row.losses}`,960,y-7);
    ctx.fillStyle="#facc15"; ctx.fillText(Number(row.rating||0).toFixed(1),1110,y-7); ctx.textAlign="left";
  });
  ctx.fillStyle="rgba(255,255,255,.65)"; ctx.font="700 20px Inter, Arial"; ctx.fillText("Generated from live CFBElite league data",70,1148);
  const blob=await new Promise((resolve)=>canvas.toBlob(resolve,"image/png")); if(!blob) return false;
  const url=URL.createObjectURL(blob); const link=document.createElement("a"); link.href=url; link.download=`CFBElite27-${sanitizeFileName(`${seasonYear}-${week}`)}-Top10.png`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url); return true;
}

async function copyLeagueText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch { return false; }
}

function GameCenter({ teams = [], users = [], assignments = [], weeklyMatchups = [], results = [], currentYear = "2026", currentWeek = "Week 1", conferenceAssets = [], adminUnlocked = false, loadData = async()=>{} }) {
  const [weekFilter, setWeekFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const seasonResults = (results || []).filter((row)=>String(row.season_year)===String(currentYear));
  const activeUserTeamIds = new Set(assignments.filter((row)=>row.status==="Active" && row.discord_user_id && row.team_id).map((row)=>String(row.team_id)));
  const rankings = computerRankingRows(teams, seasonResults, assignments, users).filter((row)=>activeUserTeamIds.has(String(row.team?.id)));
  const rankMap = new Map(rankings.map((row,index)=>[String(row.team?.id), index+1]));
  const weeks = Array.from(new Set((weeklyMatchups || []).filter((row)=>String(row.season_year)===String(currentYear)).map((row)=>String(row.week))))
    .sort((a,b)=>Number(a.replace(/\D/g,""))-Number(b.replace(/\D/g,"")));

  function matchupResult(row) {
    return seasonResults.find((game)=>
      String(game.week)===String(row.week) &&
      (
        (String(game.team_1_id)===String(row.team_1_id) && String(game.team_2_id)===String(row.team_2_id)) ||
        (String(game.team_1_id)===String(row.team_2_id) && String(game.team_2_id)===String(row.team_1_id))
      )
    ) || null;
  }

  function coachName(teamId, explicitUserId) {
    const userId = explicitUserId ||
      assignments.find((row)=>String(row.team_id)===String(teamId) && row.status==="Active")?.discord_user_id;
    return users.find((user)=>String(user.id)===String(userId))?.discord_username || "User TBD";
  }

  const allRows = (weeklyMatchups || [])
    .filter((row)=>String(row.season_year)===String(currentYear))
    .map((row)=>{
      const team1 = row.team_1 || teams.find((team)=>String(team.id)===String(row.team_1_id));
      const team2 = row.team_2 || teams.find((team)=>String(team.id)===String(row.team_2_id));
      const result = matchupResult(row);
      return {
        ...row,
        team1,
        team2,
        result,
        rank1:rankMap.get(String(row.team_1_id)) || "—",
        rank2:rankMap.get(String(row.team_2_id)) || "—",
        user1:coachName(row.team_1_id,row.team_1_user_id),
        user2:coachName(row.team_2_id,row.team_2_user_id),
      };
    });

  async function selectGameOfWeek(row) {
    const { error: clearError } = await supabase
      .from("weekly_matchups")
      .update({ is_game_of_week:false })
      .eq("season_year", Number(row.season_year || currentYear))
      .eq("week", String(row.week));
    if (clearError) return window.alert(clearError.message);

    const { error: setError } = await supabase
      .from("weekly_matchups")
      .update({ is_game_of_week:true })
      .eq("id", row.id);
    if (setError) return window.alert(setError.message);

    await loadData();
  }

  const rows = allRows.filter((row)=>{
    const normalizedWeekFilter = String(weekFilter || "all").trim().toLowerCase();
    const normalizedStatusFilter = String(statusFilter || "all").trim().toLowerCase();
    const weekMatch = normalizedWeekFilter === "all" || normalizedWeekFilter.startsWith("all week") || String(row.week).toLowerCase()===normalizedWeekFilter;
    const haystack = `${row.team1?.name||""} ${row.team2?.name||""} ${row.user1} ${row.user2}`.toLowerCase();
    const teamMatch = !teamFilter || haystack.includes(teamFilter.toLowerCase());
    const statusMatch = normalizedStatusFilter === "all" || normalizedStatusFilter.startsWith("all game") || (normalizedStatusFilter==="final" ? Boolean(row.result) : !row.result);
    return weekMatch && teamMatch && statusMatch;
  });

  const currentWeekRows = allRows.filter((row)=>String(row.week)===String(currentWeek));
  const gameOfWeek = currentWeekRows.find((row)=>row.is_game_of_week) || [...currentWeekRows].sort((a,b)=>{
    const av=(Number(a.rank1)||99)+(Number(a.rank2)||99);
    const bv=(Number(b.rank1)||99)+(Number(b.rank2)||99);
    return av-bv;
  })[0] || null;

  return (
    <section style={gameCenterPageV87}>
      <div style={gameCenterHeroV87}>
        <div>
          <span style={eyebrow}>CFBElite {currentYear}</span>
          <h1 style={gameCenterTitleV87}>GameCenter</h1>
          <p style={mutedText}>User-vs-user schedule with live automated rankings, team logos, coaches, and final scores.</p>
        </div>
        <div style={gameCenterHeroStatV87}><b>{allRows.length}</b><span>Scheduled Games</span></div>
      </div>

      <div style={gameCenterControlNoteV90}>
        <b>Commissioner Control:</b> Use “Choose as Game of the Week” on any matchup card.
      </div>

      <div className="cfb-gamecenter-filters-v87" style={gameCenterFiltersV87}>
        <select style={input} value={weekFilter} onChange={(e)=>setWeekFilter(e.target.value)}>
          <option value="all">All Weeks</option>
          {weeks.map((week)=><option key={week} value={week}>{week}</option>)}
        </select>
        <input style={input} value={teamFilter} onChange={(e)=>setTeamFilter(e.target.value)} placeholder="Search team or Discord user"/>
        <select style={input} value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)}>
          <option value="all">All Games</option>
          <option value="upcoming">Upcoming</option>
          <option value="final">Final</option>
        </select>
      </div>

      {gameOfWeek && (
        <div style={{...gameCenterFeaturedV87, background:`linear-gradient(135deg, ${getTeamPrimary(gameOfWeek.team1)}88, rgba(2,6,23,.96), ${getTeamPrimary(gameOfWeek.team2)}66)`}}>
          <div style={gameCenterFeaturedLabelV87}>★★★★★ GAME OF THE WEEK</div>
          <div style={gameCenterFeaturedTeamsV87}>
            <GameCenterTeam team={gameOfWeek.team1} rank={gameOfWeek.rank1} user={gameOfWeek.user1}/>
            <div style={gameCenterVsV87}>{gameOfWeek.result ? "FINAL" : "VS"}</div>
            <GameCenterTeam team={gameOfWeek.team2} rank={gameOfWeek.rank2} user={gameOfWeek.user2}/>
          </div>
        </div>
      )}

      <div style={gameCenterGridV87}>
        {rows.length ? rows.map((row)=>(
          <div key={row.id || `${row.week}-${row.team_1_id}-${row.team_2_id}`} style={{...gameCenterCardV87, borderColor:`${getTeamSecondary(row.team1)}55`}}>
            <div style={gameCenterCardTopV87}><span>{row.week}</span><b>{row.is_game_of_week ? "★ GAME OF THE WEEK" : row.result ? "FINAL" : "UPCOMING"}</b></div>
            <div style={gameCenterMatchupV87}>
              <GameCenterTeam team={row.team1} rank={row.rank1} user={row.user1} compact/>
              <div style={gameCenterVsV87}>{row.result ? scoreForScheduledTeam(row.result,row.team_1_id) : "VS"}</div>
              <GameCenterTeam team={row.team2} rank={row.rank2} user={row.user2} compact/>
            </div>
            {row.result && <div style={gameCenterFinalScoreV87}>{scoreForScheduledTeam(row.result,row.team_1_id)} - {scoreForScheduledTeam(row.result,row.team_2_id)}</div>}
            <div className="cfb-gamecenter-meta-v89" style={gameCenterMetaV89}>
              <span style={gameCenterConferenceLogosV90}>
                <ConferenceLogoMark conference={row.team1?.conference} conferenceAssets={conferenceAssets} size={22}/>
                <b>VS</b>
                <ConferenceLogoMark conference={row.team2?.conference} conferenceAssets={conferenceAssets} size={22}/>
              </span>
              <span>{Number(row.rank1) <= 25 && Number(row.rank2) <= 25 ? "Top 25 Matchup" : Number(row.rank1) <= 25 || Number(row.rank2) <= 25 ? "Ranked Team Featured" : "User Matchup"}</span>
            </div>
            {adminUnlocked && <button style={gameCenterGotwButtonV89} onClick={()=>selectGameOfWeek(row)}>
              {row.is_game_of_week ? "★ Selected Game of the Week" : "☆ Choose as Game of the Week"}
            </button>}
          </div>
        )) : <div style={tableEmptyStateV43}>No matchups match the selected filters.</div>}
      </div>
    </section>
  );
}

function scoreForScheduledTeam(result, teamId) {
  if (!result) return "—";
  if (String(result.team_1_id)===String(teamId)) return result.team_1_score;
  if (String(result.team_2_id)===String(teamId)) return result.team_2_score;
  return "—";
}

function GameCenterTeam({ team, rank, user, compact = false }) {
  return (
    <div style={compact ? gameCenterTeamCompactV90 : gameCenterTeamV90}>
      <div style={gameCenterRankLogoV91}>
        <TeamLogoMark team={team} size={compact ? 48 : 78}/>
        <b style={gameCenterRankBadgeV91}>#{rank}</b>
      </div>
      <strong style={gameCenterTeamNameV90}>{team?.name || "Team TBD"}</strong>
      <small style={gameCenterUserV90}>{user || "User TBD"}</small>
    </div>
  );
}

function GameCenterV2({ teams = [], users = [], assignments = [], weeklyMatchups = [], results = [], currentYear = "2026", currentWeek = "Week 1", conferenceAssets = [], adminUnlocked = false, loadData = async()=>{}, setActiveTab }) {
  const [weekFilter, setWeekFilter] = useState(currentWeek || "all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(()=>setWeekFilter(currentWeek || "all"), [currentWeek]);

  const seasonResults=(results||[]).filter((row)=>String(row.season_year)===String(currentYear));
  const activeTeamIds=new Set(assignments.filter((row)=>row.status==="Active" && row.team_id).map((row)=>String(row.team_id)));
  const rankingRows=computerRankingRows(teams.filter((team)=>!activeTeamIds.size || activeTeamIds.has(String(team.id))),seasonResults,assignments,users);
  const rankMap=new Map(rankingRows.map((row)=>[String(row.team.id),row.rank]));
  const allRows=(weeklyMatchups||[])
    .filter((row)=>String(row.season_year)===String(currentYear))
    .map((row)=>{
      const team1=row.team_1||teams.find((team)=>String(team.id)===String(row.team_1_id));
      const team2=row.team_2||teams.find((team)=>String(team.id)===String(row.team_2_id));
      const result=scheduledResultFor(row,seasonResults,currentYear);
      return {...row,team1,team2,result,rank1:rankMap.get(String(row.team_1_id))||null,rank2:rankMap.get(String(row.team_2_id))||null,user1:assignedCoachName(row.team_1_id,row.team_1_user_id,users,assignments,currentYear),user2:assignedCoachName(row.team_2_id,row.team_2_user_id,users,assignments,currentYear)};
    })
    .sort((a,b)=>weekIndex(a.week)-weekIndex(b.week)||String(a.team1?.name||"").localeCompare(String(b.team1?.name||"")));
  const weeks=Array.from(new Set(allRows.map((row)=>row.week))).sort((a,b)=>weekIndex(a)-weekIndex(b));
  const rows=allRows.filter((row)=>{
    const weekMatch=weekFilter==="all"||String(row.week)===String(weekFilter);
    const statusMatch=statusFilter==="all"||(statusFilter==="final"?Boolean(row.result):!row.result);
    const haystack=`${row.team1?.name||""} ${row.team2?.name||""} ${row.user1} ${row.user2}`.toLowerCase();
    return weekMatch&&statusMatch&&(!query||haystack.includes(query.toLowerCase()));
  });
  const currentRows=allRows.filter((row)=>String(row.week)===String(currentWeek));
  const featured=currentRows.find((row)=>row.is_game_of_week)||[...currentRows].sort((a,b)=>((a.rank1||99)+(a.rank2||99))-((b.rank1||99)+(b.rank2||99)))[0]||null;
  const finals=allRows.filter((row)=>row.result).length;

  async function chooseGame(row) {
    const clear=await supabase.from("weekly_matchups").update({is_game_of_week:false}).eq("season_year",Number(currentYear)).eq("week",row.week);
    if(clear.error){setNotice(clear.error.message);return;}
    const selected=await supabase.from("weekly_matchups").update({is_game_of_week:true}).eq("id",row.id);
    if(selected.error){setNotice(selected.error.message);return;}
    setNotice(`${row.team1?.name} vs ${row.team2?.name} selected as Game of the Week.`); await loadData();
  }

  return <section className="cfb-v2-page" style={v2Page}>
    <div style={v2PageHero}>
      <div><span style={v2Eyebrow}>CFBELITE 27 • {currentYear}</span><h1 style={v2PageTitle}>GameCenter</h1><p style={v2PageSub}>Every user matchup, final score, stream, and featured game in one broadcast-style hub.</p></div>
      <div style={v2HeroStats}><div><b>{allRows.length}</b><span>Scheduled</span></div><div><b>{finals}</b><span>Finals</span></div><div><b>{Math.max(0,allRows.length-finals)}</b><span>Upcoming</span></div></div>
    </div>
    {notice&&<div style={v2Notice}>{notice}</div>}
    {featured&&<div style={{...v2FeaturedGame,background:`linear-gradient(135deg,${getTeamPrimary(featured.team1)}dd,rgba(2,6,23,.98) 50%,${getTeamPrimary(featured.team2)}cc)`}}>
      <div style={v2FeaturedKicker}>★★★★★ {featured.is_game_of_week?"GAME OF THE WEEK":"FEATURED MATCHUP"} • {featured.week}</div>
      <div className="cfb-v2-featured-matchup" style={v2FeaturedMatchup}>
        <V2MatchupTeam team={featured.team1} rank={featured.rank1} user={featured.user1}/>
        <div style={v2FeaturedScore}>{featured.result?<><b>{scoreForScheduledTeam(featured.result,featured.team_1_id)}–{scoreForScheduledTeam(featured.result,featured.team_2_id)}</b><span>FINAL</span></>:<><b>VS</b><span>UPCOMING</span></>}</div>
        <V2MatchupTeam team={featured.team2} rank={featured.rank2} user={featured.user2}/>
      </div>
    </div>}
    <div style={v2FilterBar}>
      <div className="cfb-v2-week-tabs" style={v2WeekTabs}><button style={weekFilter==="all"?v2WeekTabActive:v2WeekTab} onClick={()=>setWeekFilter("all")}>All</button>{weeks.map((week)=><button key={week} style={weekFilter===week?v2WeekTabActive:v2WeekTab} onClick={()=>setWeekFilter(week)}>{week}</button>)}</div>
      <div className="cfb-v2-filter-inputs" style={v2FilterInputs}><input style={v2Input} value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search team or Discord user"/><select style={v2Input} value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)}><option value="all">All Games</option><option value="upcoming">Upcoming</option><option value="final">Final</option></select>{adminUnlocked&&<button style={v2PrimaryButton} onClick={()=>setActiveTab?.("weeklyMatchups")}>Manage Schedule</button>}</div>
    </div>
    <div className="cfb-v2-game-grid" style={v2GameGrid}>{rows.length?rows.map((row)=><article key={row.id||`${row.week}-${row.team_1_id}-${row.team_2_id}`} style={{...v2GameCard,borderColor:`${getTeamSecondary(row.team1)}55`}}>
      <div style={v2GameCardTop}><span>{row.week}</span><b style={row.result?v2FinalBadge:v2UpcomingBadge}>{row.result?"FINAL":"UPCOMING"}</b></div>
      <div style={v2CardMatchup}>
        <V2MatchupTeam team={row.team1} rank={row.rank1} user={row.user1} compact side="AWAY"/>
        <div style={v2CardScore}>{row.result?<b>{scoreForScheduledTeam(row.result,row.team_1_id)}–{scoreForScheduledTeam(row.result,row.team_2_id)}</b>:<b>VS</b>}</div>
        <V2MatchupTeam team={row.team2} rank={row.rank2} user={row.user2} compact side="HOME"/>
      </div>
      <div style={v2GameMeta}><span><ConferenceLogoMark conference={row.team1?.conference} conferenceAssets={conferenceAssets} size={22}/> vs <ConferenceLogoMark conference={row.team2?.conference} conferenceAssets={conferenceAssets} size={22}/></span><span>{row.scheduled_at?new Date(row.scheduled_at).toLocaleString():"Time TBD"}</span></div>
      {(row.stream_url||row.vod_url||row.notes)&&<div style={v2GameLinks}>{row.stream_url&&<a href={row.stream_url} target="_blank" rel="noreferrer">Live Stream</a>}{row.vod_url&&<a href={row.vod_url} target="_blank" rel="noreferrer">Watch VOD</a>}{row.notes&&<span>{row.notes}</span>}</div>}
      {adminUnlocked&&<div style={v2CardActions}><button onClick={()=>chooseGame(row)}>{row.is_game_of_week?"★ Featured":"☆ Feature"}</button></div>}
    </article>):<div style={v2Empty}>No matchups match these filters.</div>}</div>
  </section>;
}

function V2MatchupTeam({team,rank,user,compact=false,side}) {
  return <div className="cfb-v2-matchup-team" style={compact?v2MatchupTeamCompact:v2MatchupTeam}>
    {side&&<small style={v2SideLabel}>{side}</small>}
    <div style={v2LogoRank}><TeamLogoMark team={team} size={compact?52:94} plate/>{rank&&<b>#{rank}</b>}</div>
    <strong>{team?.name||"Team TBD"}</strong><span>{user||"User TBD"}</span>
  </div>;
}

function conferencePowerData({ teams = [], users = [], assignments = [], results = [], allResults = [], allAmericans = [], awards = [], heismans = [], nationalChampions = [], recruiting = [] }) {
  const activeAssignments = assignments.filter((assignment)=>assignment.status === "Active" && assignment.team_id && assignment.discord_user_id);
  const activeTeamIds = new Set(activeAssignments.map((assignment)=>String(assignment.team_id)));
  const activeTeams = teams.filter((team)=>activeTeamIds.has(String(team.id)));
  const rankingRows = computerRankingRows(activeTeams, results, assignments, users);
  const eloRows = userEloRows(users, assignments, allResults.length ? allResults : results);
  const eloMap = new Map(eloRows.map((row)=>[String(row.user.id),row.adjustedElo || row.elo]));
  const rankingMap = new Map(rankingRows.map((row)=>[String(row.team.id),row]));
  const conferenceMap = new Map();

  activeTeams.forEach((team)=>{
    const conference = normalizeDraftConference(team.conference) || "Unassigned";
    if (!conferenceMap.has(conference)) conferenceMap.set(conference,{conference,teams:0,recordWins:0,recordLosses:0,teamScore:0,eloScore:0,nattys:0,confTitles:0,recruitingScore:0,recruitingCount:0,allAmericans:0,awards:0,heismans:0,top25:0});
    const row = conferenceMap.get(conference);
    const ranking = rankingMap.get(String(team.id));
    const rec = recordFromResults(team.id,results);
    const activeAssignment = activeAssignments.find((assignment)=>String(assignment.team_id)===String(team.id));
    const userElo = eloMap.get(String(activeAssignment?.discord_user_id)) || 1500;
    const fullResults = allResults.length ? allResults : results;
    const latestRecruit = recruiting.filter((item)=>String(item.team_id)===String(team.id) && Number(item.rank)>0).sort((a,b)=>Number(b.season_year)-Number(a.season_year)||Number(a.rank)-Number(b.rank))[0];
    row.teams += 1;
    row.recordWins += rec.wins;
    row.recordLosses += rec.losses;
    row.teamScore += ranking?.score || 0;
    row.eloScore += Math.max(0,Math.min(100,(userElo-1300)/4));
    row.nattys += Math.max(nationalChampions.filter((item)=>String(item.team_id)===String(team.id)).length,titleCount(team.id,fullResults,"National Championship Week"));
    row.confTitles += titleCount(team.id,fullResults,"Conference Championship Week");
    row.allAmericans += allAmericans.filter((item)=>String(item.team_id)===String(team.id)).length;
    row.awards += awards.filter((item)=>String(item.team_id)===String(team.id)).length;
    row.heismans += heismans.filter((item)=>String(item.team_id)===String(team.id)).length;
    if (ranking?.rank<=25) row.top25 += 1;
    if (latestRecruit) { row.recruitingScore += Math.max(0,101-Number(latestRecruit.rank)); row.recruitingCount += 1; }
  });

  return [...conferenceMap.values()].map((row)=>{
    const games=row.recordWins+row.recordLosses;
    const performance=row.teams?Math.max(0,Math.min(100,row.teamScore/row.teams)):50;
    const userStrength=row.teams?row.eloScore/row.teams:0;
    const winPct=games?row.recordWins/games:0;
    const recordScore=games?winPct*100:50;
    const rankedDepth=row.teams?(row.top25/row.teams)*100:0;
    const championshipScore=row.teams?Math.min(100,((row.nattys*30)+(row.confTitles*10))/row.teams):0;
    const recruitingAvg=row.recruitingCount?row.recruitingScore/row.recruitingCount:45;
    const recognitionScore=row.teams?Math.min(100,((row.allAmericans*2)+(row.awards*4)+(row.heismans*12))/row.teams):0;
    const currentPerformanceScore=(performance*.70)+(recordScore*.20)+(rankedDepth*.10);
    const power=(currentPerformanceScore*.50)+(userStrength*.20)+(championshipScore*.12)+(recruitingAvg*.10)+(recognitionScore*.08);
    return {...row,games,winPct,performance,userStrength,championshipScore,recruitingAvg,recognitionScore,currentPerformanceScore,power:Number(power.toFixed(1))};
  }).sort((a,b)=>b.power-a.power);
}

function formatAmericanOdds(value) {
  const number=Number(value||0); return number>0?`+${number}`:`${number}`;
}

function currentSportsbookBoard(sportsbook,currentYear,currentWeek) {
  return (sportsbook?.boards||[]).find((row)=>String(row.season_year)===String(currentYear)&&String(row.week)===String(currentWeek));
}

function sportsbookUserId(linkedDiscordUser) { return linkedDiscordUser?.id==null?null:String(linkedDiscordUser.id); }

function CurrentWeekTicker({teams=[],weeklyMatchups=[],results=[],currentYear,currentWeek,setActiveTab}) {
  const rows=(weeklyMatchups||[]).filter((row)=>String(row.season_year)===String(currentYear)&&String(row.week)===String(currentWeek)).map((row)=>{
    const team1=row.team_1||teams.find((team)=>String(team.id)===String(row.team_1_id));
    const team2=row.team_2||teams.find((team)=>String(team.id)===String(row.team_2_id));
    const result=scheduledResultFor(row,results,currentYear);
    return {...row,team1,team2,result};
  });
  const tickerDuration=`${Math.max(28,rows.length*7)}s`;
  const renderTickerGame=(row,key,duplicate=false)=><button type="button" key={key} className="elite-ticker-game" aria-hidden={duplicate||undefined} tabIndex={duplicate?-1:0} onClick={()=>setActiveTab?.("schedule")}>
    <span><TeamLogoMark team={row.team1} size={26}/><b>{getTeamAbbreviation(row.team1)}</b></span>
    {row.result?<strong>{scoreForScheduledTeam(row.result,row.team_1_id)}–{scoreForScheduledTeam(row.result,row.team_2_id)}</strong>:<strong>VS</strong>}
    <span><b>{getTeamAbbreviation(row.team2)}</b><TeamLogoMark team={row.team2} size={26}/></span>
    <em>{row.result?"FINAL":row.scheduled_at?new Date(row.scheduled_at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}):"TBD"}</em>
  </button>;
  return <section className="elite-ticker" aria-label={`${currentWeek} GameCenter ticker`}>
    <button type="button" className="elite-ticker-label" onClick={()=>setActiveTab?.("schedule")}><span>LIVE</span><b>{currentWeek}</b><small>GameCenter</small></button>
    <div className="elite-ticker-viewport">{rows.length?<div className="elite-ticker-track" style={{"--elite-ticker-duration":tickerDuration}}><div className="elite-ticker-group">{rows.map((row)=>renderTickerGame(row,`primary-${row.id}`))}</div><div className="elite-ticker-group" aria-hidden="true">{rows.map((row)=>renderTickerGame(row,`duplicate-${row.id}`,true))}</div></div>:<div className="elite-ticker-empty">No games are listed for {currentWeek}.</div>}</div>
  </section>;
}

function EliteBooksHomePanel({sportsbook={},linkedDiscordUser,currentYear,currentWeek,setActiveTab}) {
  const seasonRows=(sportsbook.seasonStandings||[]).filter((row)=>String(row.season_year)===String(currentYear)).sort((a,b)=>Number(b.total_points)-Number(a.total_points));
  const board=currentSportsbookBoard(sportsbook,currentYear,currentWeek);
  const myId=sportsbookUserId(linkedDiscordUser);
  const mine=seasonRows.find((row)=>String(row.discord_user_id)===myId);
  const myBadges=(sportsbook.badgeAwards||[]).filter((row)=>String(row.discord_user_id)===myId&&String(row.season_year)===String(currentYear));
  return <section className="elite-books-home">
    <div className="elite-books-home-brand"><span>CFBELITE 27 SPORTSBOOK</span><h2>ELITE <i>BOOKS</i></h2><p>Current-week picks. Dynamic points. Season-long bragging rights.</p><button type="button" onClick={()=>setActiveTab?.("eliteBooks")}>Enter the Sportsbook →</button></div>
    <div className="elite-books-home-board"><div><span>{currentWeek} BOARD</span><b className={`elite-status elite-status-${board?.status||"draft"}`}>{String(board?.status||"awaiting lines").toUpperCase()}</b></div><strong>{(sportsbook.lines||[]).filter((line)=>String(line.board_id)===String(board?.id)).length}</strong><small>Games on the board</small></div>
    <div className="elite-books-home-leaders"><span>SEASON LEADERS</span>{seasonRows.slice(0,3).map((row,index)=><div key={row.discord_user_id}><b>#{index+1}</b><strong>{row.discord_username||"Discord Coach"}</strong><em>{row.total_points} pts</em></div>)}{!seasonRows.length&&<small>Standings begin after the first graded pick.</small>}</div>
    <div className="elite-books-home-me"><span>MY TICKET</span>{linkedDiscordUser?<><strong>{mine?.total_points||0} PTS</strong><small>{mine?.correct_picks||0} correct • {myBadges.length} badge{myBadges.length===1?"":"s"}</small><button type="button" onClick={()=>setActiveTab?.("myTeam")}>View My Hub</button></>:<><strong>DISCORD LOGIN</strong><small>Sign in to lock picks to your profile.</small></>}</div>
  </section>;
}

function networkTeamForUser(userId,teams,assignments,currentYear) {
  const assignment=assignments.find((row)=>String(row.discord_user_id)===String(userId)&&assignmentActiveForYear(row,currentYear))||assignments.find((row)=>String(row.discord_user_id)===String(userId)&&row.status==="Active");
  return teams.find((team)=>String(team.id)===String(assignment?.team_id));
}

function NetworkIdentity({userId,users,teams,assignments,currentYear,compact=false}) {
  const user=users.find((row)=>String(row.id)===String(userId));
  const team=networkTeamForUser(userId,teams,assignments,currentYear);
  return <span className={`network-identity ${compact?"compact":""}`}><TeamLogoMark team={team} size={compact?28:38}/><span><strong>{user?.discord_username||"League Member"}</strong>{!compact&&<small>{team?.name||"CFB Elite"}</small>}</span></span>;
}

function LeagueHub({discordSession,linkedDiscordUser,users=[],teams=[],assignments=[],currentYear,setActiveTab,setError}) {
  const [mode,setMode]=useState("channels");
  const [channels,setChannels]=useState([]);
  const [selectedChannel,setSelectedChannel]=useState(null);
  const [messages,setMessages]=useState([]);
  const [reactions,setReactions]=useState([]);
  const [conversations,setConversations]=useState([]);
  const [conversationMembers,setConversationMembers]=useState([]);
  const [selectedConversation,setSelectedConversation]=useState(null);
  const [directMessages,setDirectMessages]=useState([]);
  const [notifications,setNotifications]=useState([]);
  const [preferences,setPreferences]=useState(null);
  const [draft,setDraft]=useState("");
  const [busy,setBusy]=useState(false);
  const [memberSearch,setMemberSearch]=useState("");
  const lastNotificationRef=useRef(null);

  async function loadNetworkShell() {
    if(!discordSession?.user) return;
    await supabase.rpc("ensure_league_network_profile");
    const [channelRes,conversationRes,memberRes,notificationRes,prefRes]=await Promise.all([
      supabase.from("league_channels").select("*").eq("is_archived",false).order("sort_order"),
      supabase.from("direct_conversations").select("*").order("last_message_at",{ascending:false}),
      supabase.from("direct_conversation_members").select("*"),
      supabase.from("app_notifications").select("*").order("created_at",{ascending:false}).limit(80),
      supabase.from("notification_preferences").select("*").eq("auth_user_id",discordSession.user.id).maybeSingle(),
    ]);
    const nextChannels=channelRes.data||[];
    setChannels(nextChannels); setSelectedChannel((current)=>current||nextChannels[0]?.id||null);
    setConversations(conversationRes.data||[]); setConversationMembers(memberRes.data||[]);
    const nextNotifications=notificationRes.data||[];
    if(lastNotificationRef.current&&nextNotifications[0]?.id&&nextNotifications[0].id!==lastNotificationRef.current&&prefRes.data?.sound_enabled!==false) playEliteSound("notification",true);
    lastNotificationRef.current=nextNotifications[0]?.id||lastNotificationRef.current;
    const nextPreferences=prefRes.data||null;setNotifications(nextNotifications); setPreferences(nextPreferences);
    if(nextPreferences){localStorage.setItem("cfb-network-preferences",JSON.stringify(nextPreferences));window.dispatchEvent(new Event("cfb-preferences"));}
  }
  async function loadChannelMessages() {
    if(!selectedChannel) return;
    const [messageRes,reactionRes]=await Promise.all([supabase.from("league_channel_messages").select("*").eq("channel_id",selectedChannel).is("deleted_at",null).order("created_at",{ascending:true}).limit(250),supabase.from("league_message_reactions").select("*")]);
    if(messageRes.error)setError?.(messageRes.error.message); else setMessages(messageRes.data||[]);setReactions(reactionRes.data||[]);
  }
  async function loadDirectMessages() {
    if(!selectedConversation) return;
    const {data,error}=await supabase.from("direct_messages").select("*").eq("conversation_id",selectedConversation).is("deleted_at",null).order("created_at",{ascending:true}).limit(250);
    if(error)setError?.(error.message); else {setDirectMessages(data||[]);await supabase.rpc("mark_direct_conversation_read",{p_conversation_id:selectedConversation});}
  }
  useEffect(()=>{loadNetworkShell();const timer=window.setInterval(loadNetworkShell,NETWORK_REFRESH_MS);const channel=supabase.channel?.("league-network-ui").on("postgres_changes",{event:"INSERT",schema:"public",table:"league_channel_messages"},()=>loadChannelMessages()).on("postgres_changes",{event:"INSERT",schema:"public",table:"direct_messages"},()=>loadDirectMessages()).on("postgres_changes",{event:"INSERT",schema:"public",table:"app_notifications"},()=>loadNetworkShell()).subscribe();return()=>{window.clearInterval(timer);if(channel)supabase.removeChannel?.(channel);};},[discordSession?.user?.id,selectedChannel,selectedConversation]);
  useEffect(()=>{loadChannelMessages();},[selectedChannel]);
  useEffect(()=>{loadDirectMessages();},[selectedConversation]);

  async function sendMessage() {
    if(!draft.trim()||busy)return; setBusy(true);
    const rpc=mode==="direct"?supabase.rpc("send_direct_message",{p_conversation_id:selectedConversation,p_body:draft.trim()}):supabase.rpc("send_league_channel_message",{p_channel_id:selectedChannel,p_body:draft.trim()});
    const {error}=await rpc; setBusy(false);
    if(error){setError?.(`Message not sent: ${error.message}`);return;}
    setDraft(""); if(mode==="direct")await loadDirectMessages();else await loadChannelMessages();
  }
  async function startConversation(userId) {
    setBusy(true);const {data,error}=await supabase.rpc("start_direct_conversation",{p_other_discord_user_id:String(userId)});setBusy(false);
    if(error){setError?.(`Conversation could not start: ${error.message}`);return;}
    await loadNetworkShell();setSelectedConversation(data);setMode("direct");setMemberSearch("");
  }
  async function savePreference(field,value) {
    const next={...(preferences||{}),auth_user_id:discordSession.user.id,discord_user_id:String(linkedDiscordUser.id),[field]:value,updated_at:new Date().toISOString()};
    setPreferences(next);localStorage.setItem("cfb-network-preferences",JSON.stringify(next));window.dispatchEvent(new Event("cfb-preferences"));const {error}=await supabase.from("notification_preferences").upsert(next,{onConflict:"auth_user_id"});if(error)setError?.(`Preference not saved: ${error.message}`);
  }
  async function enablePush() {
    try{
      if(!("serviceWorker" in navigator)||!("PushManager" in window))throw new Error("Push notifications are not supported in this browser.");
      const permission=await Notification.requestPermission();if(permission!=="granted")throw new Error("Notification permission was not granted.");
      const vapid=import.meta.env.VITE_VAPID_PUBLIC_KEY;if(!vapid)throw new Error("Push delivery will activate after the commissioner installs the VAPID public key.");
      const registration=await navigator.serviceWorker.register("/sw.js");
      const bytes=Uint8Array.from(atob(vapid.replace(/-/g,"+").replace(/_/g,"/")),(char)=>char.charCodeAt(0));
      const subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});const json=subscription.toJSON();
      const {error}=await supabase.from("push_subscriptions").upsert({auth_user_id:discordSession.user.id,endpoint:json.endpoint,p256dh:json.keys.p256dh,auth_secret:json.keys.auth,user_agent:navigator.userAgent,last_used_at:new Date().toISOString()},{onConflict:"endpoint"});
      if(error)throw error;await savePreference("push_enabled",true);setError?.("Push notifications enabled on this device.");
    }catch(error){setError?.(error.message);}
  }
  async function markNotificationsRead() {await supabase.rpc("mark_app_notification_read",{});await loadNetworkShell();}
  const selectedChannelRow=channels.find((row)=>String(row.id)===String(selectedChannel));
  const unread=notifications.filter((row)=>!row.read_at).length;
  const conversationOther=(conversationId)=>{const member=conversationMembers.find((row)=>String(row.conversation_id)===String(conversationId)&&String(row.discord_user_id)!==String(linkedDiscordUser.id));return users.find((row)=>String(row.id)===String(member?.discord_user_id));};
  const filteredMembers=users.filter((user)=>user.is_active!==false&&String(user.id)!==String(linkedDiscordUser.id)&&String(user.discord_username).toLowerCase().includes(memberSearch.toLowerCase())).slice(0,12);
  const displayedMessages=mode==="direct"?directMessages:messages;
  return <main className="cfb-v2-page network-page"><section className="network-hero"><div><span>CFB ELITE NETWORK</span><h1>League Hub</h1><p>Every announcement, conversation and rivalry—inside the dynasty.</p></div><div className="network-live-presence"><i/><strong>{users.filter((row)=>row.is_active!==false).length}</strong><span>League Members</span></div></section><div className="network-layout"><aside className="network-sidebar"><nav><button className={mode==="channels"?"active":""} onClick={()=>setMode("channels")}>Channels</button><button className={mode==="direct"?"active":""} onClick={()=>setMode("direct")}>Messages</button><button className={mode==="notifications"?"active":""} onClick={()=>setMode("notifications")}>Alerts {unread>0&&<b>{unread}</b>}</button><button className={mode==="settings"?"active":""} onClick={()=>setMode("settings")}>Settings</button></nav>{mode==="channels"&&<div className="network-channel-list">{channels.map((channel)=><button key={channel.id} className={String(selectedChannel)===String(channel.id)?"active":""} onClick={()=>setSelectedChannel(channel.id)}><b>{channel.icon}</b><span><strong>{channel.name}</strong><small>{channel.description}</small></span></button>)}</div>}{mode==="direct"&&<><label className="network-member-search"><span>NEW MESSAGE</span><input value={memberSearch} onChange={(event)=>setMemberSearch(event.target.value)} placeholder="Find a league member"/></label>{memberSearch&&<div className="network-member-results">{filteredMembers.map((user)=><button key={user.id} onClick={()=>startConversation(user.id)}><NetworkIdentity userId={user.id} users={users} teams={teams} assignments={assignments} currentYear={currentYear} compact/></button>)}</div>}<div className="network-conversation-list">{conversations.map((conversation)=>{const other=conversationOther(conversation.id);return <button key={conversation.id} className={String(selectedConversation)===String(conversation.id)?"active":""} onClick={()=>setSelectedConversation(conversation.id)}><NetworkIdentity userId={other?.id} users={users} teams={teams} assignments={assignments} currentYear={currentYear} compact/><small>{new Date(conversation.last_message_at).toLocaleDateString()}</small></button>})}</div></>}</aside><section className="network-stage">{mode==="notifications"?<div className="network-notifications"><header><div><span>INBOX</span><h2>Notifications</h2></div><button onClick={markNotificationsRead}>Mark all read</button></header>{notifications.map((notification)=><button key={notification.id} className={notification.read_at?"":"unread"} onClick={()=>{if(notification.target_tab)setActiveTab?.(notification.target_tab);}}><i/><span><strong>{notification.title}</strong><p>{notification.body}</p><small>{new Date(notification.created_at).toLocaleString()}</small></span></button>)}</div>:mode==="settings"?<NotificationSettings preferences={preferences} savePreference={savePreference} enablePush={enablePush}/>:<><header className="network-stage-header"><div><span>{mode==="direct"?"PRIVATE CONVERSATION":selectedChannelRow?.channel_type?.toUpperCase()}</span><h2>{mode==="direct"?(conversationOther(selectedConversation)?.discord_username||"Select a conversation"):(selectedChannelRow?.name||"League Channel")}</h2><p>{mode==="direct"?"Only members of this conversation can read these messages.":selectedChannelRow?.description}</p></div>{mode==="channels"&&selectedChannelRow?.slug==="streams"&&<button onClick={()=>setActiveTab?.("redZone")}>Open RedZone</button>}</header><div className="network-message-feed">{displayedMessages.map((message)=><article key={message.id} className={String(message.author_discord_user_id)===String(linkedDiscordUser.id)?"mine":""}><NetworkIdentity userId={message.author_discord_user_id} users={users} teams={teams} assignments={assignments} currentYear={currentYear}/><p>{message.body}</p><time>{new Date(message.created_at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}</time></article>)}{!displayedMessages.length&&<div className="network-empty"><b>Start the conversation.</b><span>This space is ready for the league.</span></div>}</div><div className="network-composer"><textarea value={draft} onChange={(event)=>setDraft(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();sendMessage();}}} placeholder={mode==="direct"?"Message privately…":`Message #${selectedChannelRow?.slug||"channel"}…`} disabled={mode==="direct"&&!selectedConversation}/><button disabled={busy||!draft.trim()||(mode==="direct"&&!selectedConversation)} onClick={sendMessage}>{busy?"Sending…":"Send"}</button><small>Enter to send • Shift + Enter for a new line</small></div></>}</section></div></main>;
}

function NotificationSettings({preferences,savePreference,enablePush}) {
  const options=[["announcements","Commissioner announcements","Official league updates and deadlines"],["direct_messages","Direct messages","Private messages from league members"],["mentions","Mentions and replies","When someone specifically tags you"],["streams_live","Streams going live","RedZone alerts for active league streams"],["game_results","Final scores","GameCenter results and sportsbook grading"],["advancement","Week advancement","New week and advancement deadline alerts"],["elite_books","Elite Books","New lines, locks and settled tickets"]];
  return <div className="network-settings"><header><span>CONTROL ROOM</span><h2>Notification & Sound Settings</h2><p>You decide what gets your attention and how the app feels.</p></header><section><div><strong>Push Notifications</strong><small>Receive alerts when the installed app is closed.</small></div><button onClick={enablePush}>{preferences?.push_enabled?"Enabled on a device":"Enable Push"}</button></section><section><div><strong>Elite Pulse</strong><small>The original three-note CFB Elite notification signature.</small></div><span className="network-setting-actions"><button onClick={()=>playEliteSound("notification",true)}>Preview</button><input type="checkbox" checked={preferences?.sound_enabled!==false} onChange={(event)=>savePreference("sound_enabled",event.target.checked)}/></span></section><section><div><strong>Menu Sounds</strong><small>Subtle navigation feedback.</small></div><span className="network-setting-actions"><button onClick={()=>playEliteSound("menu",true)}>Preview</button><input type="checkbox" checked={Boolean(preferences?.menu_sounds)} onChange={(event)=>savePreference("menu_sounds",event.target.checked)}/></span></section><section><div><strong>Team Page Sounds</strong><small>A short broadcast swell when entering a team profile.</small></div><span className="network-setting-actions"><button onClick={()=>playEliteSound("team",true)}>Preview</button><input type="checkbox" checked={Boolean(preferences?.team_sounds)} onChange={(event)=>savePreference("team_sounds",event.target.checked)}/></span></section><div className="network-setting-grid">{options.map(([key,title,description])=><label key={key}><span><strong>{title}</strong><small>{description}</small></span><input type="checkbox" checked={preferences?.[key]!==false} onChange={(event)=>savePreference(key,event.target.checked)}/></label>)}</div></div>;
}

function streamPlayerUrl(profile,status) {
  if(profile.embed_url)return profile.embed_url;
  if(profile.platform==="twitch")return `https://player.twitch.tv/?channel=${encodeURIComponent(profile.channel_key)}&parent=${encodeURIComponent(window.location.hostname)}&autoplay=false&muted=true`;
  if(profile.platform==="youtube"&&status?.live_video_id)return `https://www.youtube.com/embed/${encodeURIComponent(status.live_video_id)}?autoplay=0&playsinline=1`;
  if(profile.platform==="kick")return `https://player.kick.com/${encodeURIComponent(profile.channel_key)}`;
  return "";
}

function RedZoneCenter({discordSession,linkedDiscordUser,users=[],teams=[],assignments=[],currentYear,setError}) {
  const [profiles,setProfiles]=useState([]);const [statuses,setStatuses]=useState([]);const [selected,setSelected]=useState([]);const [editing,setEditing]=useState(false);const [form,setForm]=useState({platform:"twitch",channel_key:"",channel_url:"",display_name:""});const [busy,setBusy]=useState(false);
  async function loadStreams(){const [profileRes,statusRes]=await Promise.all([supabase.from("stream_profiles").select("*").eq("enabled",true).order("updated_at",{ascending:false}),supabase.from("live_stream_status").select("*")]);if(profileRes.error)setError?.(profileRes.error.message);else setProfiles(profileRes.data||[]);setStatuses(statusRes.data||[]);}
  useEffect(()=>{loadStreams();const timer=window.setInterval(loadStreams,30000);const channel=supabase.channel?.("redzone-live-status").on("postgres_changes",{event:"*",schema:"public",table:"live_stream_status"},loadStreams).subscribe();return()=>{window.clearInterval(timer);if(channel)supabase.removeChannel?.(channel);};},[]);
  const statusFor=(id)=>statuses.find((row)=>String(row.profile_id)===String(id));
  const ordered=[...profiles].sort((a,b)=>Number(Boolean(statusFor(b.id)?.is_live))-Number(Boolean(statusFor(a.id)?.is_live))||String(a.display_name).localeCompare(String(b.display_name)));
  function toggleWatch(profile){const exists=selected.includes(profile.id);if(exists){setSelected(selected.filter((id)=>id!==profile.id));return;}if(selected.length>=4){setError?.("RedZone multiview supports up to four streams at once.");return;}setSelected([...selected,profile.id]);}
  async function saveProfile(){if(!form.channel_key.trim()||!form.channel_url.trim()){setError?.("Enter the platform channel ID/slug and public channel URL.");return;}setBusy(true);const payload={discord_user_id:String(linkedDiscordUser.id),platform:form.platform,channel_key:form.channel_key.trim(),channel_url:form.channel_url.trim(),display_name:form.display_name.trim()||linkedDiscordUser.discord_username,enabled:true,updated_at:new Date().toISOString()};const{error}=await supabase.from("stream_profiles").upsert(payload,{onConflict:"discord_user_id,platform"});setBusy(false);if(error)setError?.(`Stream profile not saved: ${error.message}`);else{setEditing(false);setForm({...form,channel_key:"",channel_url:"",display_name:""});await loadStreams();}}
  const selectedProfiles=selected.map((id)=>profiles.find((row)=>String(row.id)===String(id))).filter(Boolean);
  const liveCount=ordered.filter((profile)=>statusFor(profile.id)?.is_live).length;
  return <main className="cfb-v2-page redzone-page"><section className="redzone-hero"><div><span>CFB ELITE LIVE</span><h1>RedZone</h1><p>Every league stream. One control room. Up to four games at once.</p></div><div><i/><strong>{liveCount}</strong><span>LIVE NOW</span></div></section>{selectedProfiles.length>0&&<section className={`redzone-multiview streams-${selectedProfiles.length}`}>{selectedProfiles.map((profile)=>{const status=statusFor(profile.id);const url=streamPlayerUrl(profile,status);return <article key={profile.id}><header><NetworkIdentity userId={profile.discord_user_id} users={users} teams={teams} assignments={assignments} currentYear={currentYear} compact/><button onClick={()=>toggleWatch(profile)}>×</button></header>{url?<iframe src={url} title={`${profile.display_name} stream`} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen/>:<div className="redzone-player-fallback"><b>Live player is waiting for this platform’s video ID.</b><a href={profile.channel_url} target="_blank" rel="noreferrer">Open Stream</a></div>}</article>})}</section>}<section className="redzone-directory"><header><div><span>LIVE DIRECTORY</span><h2>{liveCount?"The league is on the air":"Stream control room"}</h2></div><button onClick={()=>setEditing(!editing)}>{editing?"Close":"Manage My Streams"}</button></header>{editing&&<div className="redzone-profile-form"><select value={form.platform} onChange={(event)=>setForm({...form,platform:event.target.value})}><option value="twitch">Twitch</option><option value="youtube">YouTube</option><option value="kick">Kick</option></select><input value={form.channel_key} onChange={(event)=>setForm({...form,channel_key:event.target.value})} placeholder={form.platform==="youtube"?"YouTube channel ID":"Channel name / slug"}/><input value={form.channel_url} onChange={(event)=>setForm({...form,channel_url:event.target.value})} placeholder="Public channel URL"/><input value={form.display_name} onChange={(event)=>setForm({...form,display_name:event.target.value})} placeholder="Display name (optional)"/><button disabled={busy} onClick={saveProfile}>{busy?"Saving…":"Save Stream"}</button><small>Automatic live detection activates after the platform credentials are installed securely on the server.</small></div>}<div className="redzone-stream-grid">{ordered.map((profile)=>{const status=statusFor(profile.id);const user=users.find((row)=>String(row.id)===String(profile.discord_user_id));const team=networkTeamForUser(profile.discord_user_id,teams,assignments,currentYear);return <article key={profile.id} className={status?.is_live?"live":"offline"} style={{"--stream-team":getTeamPrimary(team)}}><div className="redzone-thumb">{status?.thumbnail_url?<img src={status.thumbnail_url} alt=""/>:<TeamLogoMark team={team} size={92}/>}<b>{status?.is_live?"LIVE":"OFFLINE"}</b><span>{profile.platform.toUpperCase()}</span></div><div><NetworkIdentity userId={user?.id} users={users} teams={teams} assignments={assignments} currentYear={currentYear}/><h3>{status?.stream_title||`${profile.display_name||user?.discord_username} stream`}</h3><p>{status?.is_live?`${status.viewer_count||0} watching${status.category_name?` • ${status.category_name}`:""}`:"We’ll light this tile up automatically when they go live."}</p></div><footer><button disabled={!status?.is_live} className={selected.includes(profile.id)?"selected":""} onClick={()=>toggleWatch(profile)}>{selected.includes(profile.id)?"Remove from Multiview":selected.length?"Add to Multiview":"Watch in RedZone"}</button><a href={profile.channel_url} target="_blank" rel="noreferrer">Open Platform</a></footer></article>})}{!ordered.length&&<div className="redzone-empty"><b>No streams linked yet.</b><span>Each member can add Twitch, YouTube or Kick from Manage My Streams.</span></div>}</div></section></main>;
}

function EliteBooks({sportsbook={},teams=[],users=[],assignments=[],results=[],weeklyMatchups=[],conferenceAssets=[],currentYear,currentWeek,advanceAt,discordSession,linkedDiscordUser,busy,signInWithDiscord,signOutDiscord,submitPick,submitFuture,setActiveTab}) {
  const [ticketDrafts,setTicketDrafts]=useState({});
  const board=currentSportsbookBoard(sportsbook,currentYear,currentWeek);
  const matchupMap=new Map((weeklyMatchups||[]).map((row)=>[String(row.id),row]));
  const lines=(sportsbook.lines||[]).filter((line)=>String(line.board_id)===String(board?.id)).sort((a,b)=>{
    const matchupA=matchupMap.get(String(a.matchup_id)); const matchupB=matchupMap.get(String(b.matchup_id));
    const timeA=matchupA?.scheduled_at?new Date(matchupA.scheduled_at).getTime():Number.MAX_SAFE_INTEGER;
    const timeB=matchupB?.scheduled_at?new Date(matchupB.scheduled_at).getTime():Number.MAX_SAFE_INTEGER;
    return timeA-timeB||String(matchupA?.team_1?.name||a.team_1_id).localeCompare(String(matchupB?.team_1?.name||b.team_1_id))||String(a.id).localeCompare(String(b.id));
  });
  const myId=sportsbookUserId(linkedDiscordUser);
  const myPicks=(sportsbook.picks||[]).filter((pick)=>String(pick.discord_user_id)===myId);
  const standings=(sportsbook.seasonStandings||[]).filter((row)=>String(row.season_year)===String(currentYear)).sort((a,b)=>Number(b.total_points)-Number(a.total_points));
  const marketOrder={national_champion:0,conference_champion:1,heath_hurley_coty:2,most_improved_team:3};
  const markets=(sportsbook.markets||[]).filter((row)=>String(row.season_year)===String(currentYear)).sort((a,b)=>(marketOrder[a.market_type]??99)-(marketOrder[b.market_type]??99)||String(a.conference_name||a.title||"").localeCompare(String(b.conference_name||b.title||""))||String(a.id).localeCompare(String(b.id)));
  const rankings=computerRankingRows(teams,results.filter((row)=>String(row.season_year)===String(currentYear)),assignments,users);
  const rankMap=new Map(rankings.map((row)=>[String(row.team.id),row.rank]));
  const locked=!board||board.status!=="open";
  const newTicketRules=Number(board?.week_index??weekIndex(currentWeek))>=3;
  const marketLabel={national_champion:"National Champion",conference_champion:"Conference Champion",heath_hurley_coty:"Heath Hurley COTY",most_improved_team:"Most Improved Team"};
  function teamFor(id){return teams.find((team)=>String(team.id)===String(id));}
  function teamForCoach(id){const assignment=assignments.find((row)=>String(row.discord_user_id)===String(id)&&assignmentActiveForYear(row,currentYear));return teamFor(assignment?.team_id);}
  function pickSlot(pick){return pick?.pick_slot||(pick?.pick_type==="total"?"total":"side");}
  function savedLinePick(line,slot){return myPicks.find((pick)=>String(pick.line_id)===String(line.id)&&pickSlot(pick)===slot);}
  function normalizedSavedChoice(pick){return pick?{type:pick.pick_type,selection:pick.pick_type==="total"?pick.selected_total_side:String(pick.selected_team_id)}:null;}
  function draftKey(line,slot){return `${String(line.id)}:${slot}`;}
  function currentChoice(line,slot){return ticketDrafts[draftKey(line,slot)]||normalizedSavedChoice(savedLinePick(line,slot));}
  function choosePick(line,type,selection){
    if(busy||locked||line.is_betting_locked||!discordSession)return;
    if(!newTicketRules){submitPick(line.id,type,String(selection));return;}
    const slot=type==="total"?"total":"side";
    setTicketDrafts((drafts)=>({...drafts,[draftKey(line,slot)]:{type,selection:String(selection)}}));
  }
  async function lockInPick(line){
    const pending=["side","total"].map((slot)=>[slot,ticketDrafts[draftKey(line,slot)]]).filter(([,draft])=>draft);
    if(!pending.length)return;
    const completed=[];
    for(const [slot,draft] of pending){
      const saved=await submitPick(line.id,draft.type,draft.selection);
      if(saved)completed.push(slot);
    }
    if(completed.length)setTicketDrafts((drafts)=>{const next={...drafts};completed.forEach((slot)=>delete next[draftKey(line,slot)]);return next;});
  }
  function pickButton(line,type,selection,label,display,points,subline=""){
    const slot=newTicketRules?(type==="total"?"total":"side"):type;
    const choice=currentChoice(line,slot);
    const active=choice?.type===type&&String(choice.selection)===String(selection);
    return <button type="button" disabled={busy||locked||line.is_betting_locked||!discordSession} className={`elite-pick-button ${active?"selected":""}`} onClick={()=>choosePick(line,type,selection)}><span>{label}</span><b>{display}</b>{subline&&<em>{subline}</em>}<small>{points} PT{points===1?"":"S"}</small></button>;
  }
  return <main className="cfb-v2-page elite-books-page">
    <div className="elite-books-hero"><div><span>CFBELITE 27 PRESENTS</span><h1>ELITE <i>BOOKS</i></h1><p>Beat the line. Build your card. Own the season.</p><div className="elite-books-rule-pills">{newTicketRules?<><b>✓ One ML or spread pick</b><b>✓ Plus one over/under</b><b>✓ Editable until manual lock</b></>:<><b>✓ Week 2 legacy board</b><b>✓ Moneyline and spread remain separate</b><b>✓ New format begins Week 3</b></>}</div></div><div className="elite-auth-card">{discordSession?<><span>BETTING AS</span><strong>{linkedDiscordUser?.discord_username||discordSession.user?.user_metadata?.user_name||"Discord Member"}</strong><small>Scores stay tied to your Discord identity.</small><button type="button" onClick={signOutDiscord}>Sign out</button></>:<><span>YOUR CARD STARTS HERE</span><strong>Sign in with Discord</strong><small>Your picks, points, futures and badges follow your account.</small><button type="button" onClick={signInWithDiscord}>Continue with Discord</button></>}</div></div>
    <CurrentWeekTicker teams={teams} weeklyMatchups={weeklyMatchups} results={results} currentYear={currentYear} currentWeek={currentWeek} setActiveTab={setActiveTab}/>
    <div className="elite-books-scorebar"><div><span>BOARD</span><b>{currentWeek}</b></div><div><span>STATUS</span><b className={`elite-status elite-status-${board?.status||"draft"}`}>{String(board?.status||"NOT PUBLISHED").toUpperCase()}</b></div><div><span>LOCK</span><b>Manual by matchup</b></div><div><span>MY PICKS</span><b>{myPicks.filter((pick)=>String(pick.board_id)===String(board?.id)).length}</b></div></div>
    <section className="elite-books-layout">
      <div className="elite-books-main"><div className="elite-section-head"><div><span>WEEKLY BOARD</span><h2>{newTicketRules?"Moneyline, Spread & Totals":"Moneyline & Spread"}</h2></div><small>{newTicketRules?"Choose one side (moneyline or spread) and one total (over or under), then press Lock It In":"Week 2 keeps the original board and all existing selections; the new ticket format begins Week 3"}</small></div>
        {lines.length?<div className="elite-lines-grid">{lines.map((line)=>{
          const m=matchupMap.get(String(line.matchup_id));
          const t1=teamFor(line.team_1_id)||m?.team_1;
          const t2=teamFor(line.team_2_id)||m?.team_2;
          const savedSide=savedLinePick(line,"side");
          const savedTotal=savedLinePick(line,"total");
          const sideDraft=ticketDrafts[draftKey(line,"side")];
          const totalDraft=ticketDrafts[draftKey(line,"total")];
          const hasDraft=Boolean(sideDraft||totalDraft);
          const total=Number(line.total_line||49.5);
          const totalOddsOver=Number(line.over_moneyline||-110);
          const totalOddsUnder=Number(line.under_moneyline||-110);
          const sideLabel=savedSide?`${getTeamAbbreviation(teamFor(savedSide.selected_team_id))} ${savedSide.pick_type}`.toUpperCase():"NOT SELECTED";
          const totalLabel=savedTotal?`${String(savedTotal.selected_total_side||"").toUpperCase()} ${Number(savedTotal.locked_total||total).toFixed(1)}`:"NOT SELECTED";
          return <article className={`elite-line-card ${line.is_betting_locked?"betting-closed":""} ${line.voided_at?"matchup-voided":""}`} key={line.id} style={{"--team-one":getTeamPrimary(t1),"--team-two":getTeamPrimary(t2)}}>
            <header><span>{currentWeek}</span>{line.voided_at?<b>VOID</b>:line.settled_at?<b>FINAL</b>:line.is_betting_locked?<b>BETTING CLOSED</b>:<b>PICKS OPEN</b>}</header>
            <div className="elite-line-matchup"><div><TeamLogoMark team={t1} size={70}/><b>#{line.team_1_rank||rankMap.get(String(t1?.id))||"—"}</b><strong>{t1?.name}</strong></div><span>VS</span><div><TeamLogoMark team={t2} size={70}/><b>#{line.team_2_rank||rankMap.get(String(t2?.id))||"—"}</b><strong>{t2?.name}</strong></div></div>
            {line.settled_at&&!line.voided_at&&<div className="elite-final-score"><b>{line.team_1_score}</b><span>FINAL</span><b>{line.team_2_score}</b></div>}
            {line.voided_at?<div className="elite-betting-closed elite-betting-voided"><b>MATCHUP VOIDED</b><span>{line.void_reason||"Game was not played"}</span></div>:line.is_betting_locked&&<div className="elite-betting-closed"><b>BETTING LOCKED</b><span>{line.betting_lock_reason||"Game started"}</span></div>}
            <div className="elite-market"><label>MONEYLINE</label>{pickButton(line,"moneyline",t1?.id,getTeamAbbreviation(t1),formatAmericanOdds(line.team_1_moneyline),moneylinePointPreview(line.team_1_moneyline))}{pickButton(line,"moneyline",t2?.id,getTeamAbbreviation(t2),formatAmericanOdds(line.team_2_moneyline),moneylinePointPreview(line.team_2_moneyline))}</div>
            <div className="elite-market"><label>SPREAD</label>{pickButton(line,"spread",t1?.id,getTeamAbbreviation(t1),formatSpread(line.team_1_spread),spreadPointPreview(line.team_1_spread))}{pickButton(line,"spread",t2?.id,getTeamAbbreviation(t2),formatSpread(line.team_2_spread),spreadPointPreview(line.team_2_spread))}</div>
            {newTicketRules&&<div className="elite-market elite-total-market"><label>TOTAL {total.toFixed(1)}</label>{pickButton(line,"total","over","OVER",`O ${total.toFixed(1)}`,moneylinePointPreview(totalOddsOver),formatAmericanOdds(totalOddsOver))}{pickButton(line,"total","under","UNDER",`U ${total.toFixed(1)}`,moneylinePointPreview(totalOddsUnder),formatAmericanOdds(totalOddsUnder))}</div>}
            {newTicketRules?<div className={`elite-ticket-submit ${hasDraft?"has-draft":""}`}><span>{hasDraft?"Changes ready—Lock It In to update your Discord ticket.":`SIDE: ${sideLabel} • TOTAL: ${totalLabel} • Editable until betting closes.`}</span><button type="button" disabled={busy||locked||line.is_betting_locked||!discordSession||!hasDraft} onClick={()=>lockInPick(line)}>{busy?"SAVING…":"LOCK IT IN"}</button></div>:<div className="elite-ticket-submit elite-legacy-ticket"><span>WEEK 2: Moneyline and spread selections remain separate and save immediately. Existing picks are unchanged.</span></div>}
            <footer><span>Model edge: {Math.abs(Number(line.projected_margin||0)).toFixed(1)} pts{newTicketRules?` • projected total ${total.toFixed(1)}`:""}</span><span>{line.is_betting_locked?"Matchup closed":line.is_frozen?"Odds frozen after first ticket":"Live model line"}</span></footer>
          </article>;
        })}</div>:<div className="elite-empty"><b>THE BOARD IS BEING BUILT</b><span>The commissioner can generate {currentWeek} lines after the Elite Books migration is installed.</span></div>}
      </div>
      <aside className="elite-books-sidebar"><div className="elite-section-head"><div><span>LEADERBOARD</span><h2>{currentYear} Standings</h2></div><button onClick={()=>setActiveTab?.("sportsbookHistory")}>All-Time →</button></div><div className="elite-leaderboard">{standings.length?standings.map((row,index)=><div key={row.discord_user_id} className={String(row.discord_user_id)===myId?"me":""}><b>#{index+1}</b><span><strong>{row.discord_username}</strong><small>{row.correct_picks}/{row.graded_picks} correct</small></span><em>{row.total_points} pts</em></div>):<div className="elite-empty-small">No graded cards yet.</div>}</div><EliteBadgeRail sportsbook={sportsbook} discordUserId={myId} currentYear={currentYear}/></aside>
    </section>
    <section className="elite-futures"><div className="elite-section-head"><div><span>SEASON FUTURES</span><h2>Call Your Shot</h2></div><small>Selections save instantly to your Discord profile • longer odds pay more bonus points</small></div>{markets.length?<div className="elite-futures-grid">{markets.map((market)=>{const options=(sportsbook.options||[]).filter((option)=>String(option.market_id)===String(market.id)).sort((a,b)=>Number(a.american_odds)-Number(b.american_odds)||String(a.selection_label).localeCompare(String(b.selection_label))||String(a.id).localeCompare(String(b.id))); const existing=(sportsbook.futurePicks||[]).find((pick)=>String(pick.discord_user_id)===myId&&String(pick.market_id)===String(market.id)); return <article className="elite-future-card" key={market.id}><header><div>{market.market_type==="conference_champion"&&<ConferenceLogoMark conference={market.conference_name} conferenceAssets={conferenceAssets} size={38}/>}<span><small>{market.conference_name||"CFBELITE 27"}</small><strong>{market.title||marketLabel[market.market_type]}</strong></span></div><b>{market.status.toUpperCase()}</b></header><div className="elite-future-options">{options.map((option)=>{const team=option.team_id?teamFor(option.team_id):option.discord_user_id?teamForCoach(option.discord_user_id):null; const selected=String(existing?.option_id)===String(option.id); return <button className={selected?"selected":""} disabled={busy||market.status!=="open"||!discordSession} key={option.id} onClick={()=>submitFuture(option.id)}>{team?<TeamLogoMark team={team} size={38}/>:<span className="elite-coach-avatar">{option.selection_label.slice(0,1).toUpperCase()}</span>}<span><strong>{option.selection_label}</strong><small>{formatAmericanOdds(option.american_odds)}</small></span><em>{option.bonus_points} pts</em></button>})}</div></article>})}</div>:<div className="elite-empty"><b>FUTURES OPENING SOON</b><span>National Champion, Conference Champions and Heath Hurley COTY begin in Season 1. Most Improved Team automatically joins in Season 2.</span></div>}</section>
  </main>;
}

function formatSpread(value){const number=Number(value||0);return number>0?`+${number.toFixed(1)}`:number.toFixed(1);}
function moneylinePointPreview(odds){const n=Number(odds||0);return n<100?1:n<200?2:n<400?3:n<700?4:5;}
function spreadPointPreview(spread){const n=Number(spread||0);return n<7?1:n<14?2:n<21?3:4;}

const ELITE_BADGE_MARKS={sharp:"S",heater:"HOT",dog_whisperer:"DOG",perfect_card:"P",bookie_breaker:"10+",cold_ticket:"ICE",chalk_eater:"CH",season_champ:"C"};
function EliteBadgeMark({code}) { return <i className="elite-badge-mark">{ELITE_BADGE_MARKS[code]||"EB"}</i>; }

function EliteBadgeRail({sportsbook={},discordUserId,currentYear}) {
  const defs=new Map((sportsbook.badges||[]).map((badge)=>[badge.code,badge]));
  const awards=(sportsbook.badgeAwards||[]).filter((row)=>(!discordUserId||String(row.discord_user_id)===String(discordUserId))&&String(row.season_year)===String(currentYear)).slice(0,6);
  return <div className="elite-badge-rail"><div><span>RECOGNITION</span><b>Badges & Heat Checks</b></div>{awards.length?awards.map((award)=>{const badge=defs.get(award.badge_code)||{};return <span key={award.id} title={badge.description}><EliteBadgeMark code={award.badge_code}/><strong>{badge.title||award.badge_code}</strong></span>}):<small>Perfect cards, heaters, underdog hits—and even cold tickets—show up here.</small>}</div>;
}

function EliteBooksHistory({sportsbook={},users=[],currentYear,setActiveTab}) {
  const rows=[...(sportsbook.allTimeStandings||[])].sort((a,b)=>Number(b.total_points)-Number(a.total_points));
  const champions=[...(sportsbook.champions||[])].sort((a,b)=>Number(b.season_year)-Number(a.season_year));
  const defs=new Map((sportsbook.badges||[]).map((badge)=>[badge.code,badge]));
  const record=(row)=>`${Number(row.correct_picks||0)}-${Number(row.lost_picks||0)}-${Number(row.pushes||0)}`;
  const marketRecord=(row,prefix)=>`${Number(row[`${prefix}_wins`]||0)}-${Number(row[`${prefix}_losses`]||0)}`;
  return <main className="cfb-v2-page elite-books-page"><div className="elite-history-hero"><div><span>THE LEDGER</span><h1>All-Time Sportsbook</h1><p>Every completed season preserved. New-year standings reset; legacy never does.</p></div><button onClick={()=>setActiveTab?.("eliteBooks")}>Back to Elite Books</button></div><section className="elite-history-grid"><div className="elite-history-table elite-history-ledger"><div className="elite-section-head"><div><span>CAREER BOARD</span><h2>All-Time Betting Ledger</h2></div><small>Records display wins-losses; overall record also includes pushes.</small></div>{rows.length?<div className="elite-history-ledger-scroll"><div className="elite-history-ledger-head"><span>Rank</span><span>Bettor</span><span>Record</span><span>Win %</span><span>Moneyline</span><span>Spread</span><span>O/U</span><span>Dog Wins</span><span>Points</span></div>{rows.map((row,index)=><div className="elite-history-ledger-row" key={row.discord_user_id}><b>#{index+1}</b><span><strong>{row.discord_username}</strong><small>{row.graded_picks} graded pick{Number(row.graded_picks)===1?"":"s"} • {row.seasons} season{Number(row.seasons)===1?"":"s"}</small></span><strong>{record(row)}</strong><span>{Number(row.win_percentage||0).toFixed(1)}%</span><span>{marketRecord(row,"moneyline")}</span><span>{marketRecord(row,"spread")}</span><span>{marketRecord(row,"total")}</span><span>{Number(row.underdog_wins||0)}</span><em>{row.total_points} pts</em></div>)}</div>:<div className="elite-empty-small">Career standings begin after the first graded season.</div>}</div><aside className="elite-champions"><div className="elite-section-head"><div><span>CHAMPIONS</span><h2>Season Winners</h2></div></div>{champions.length?champions.map((row)=><div key={row.season_year}><b>{row.season_year}</b><strong>{row.discord_username||users.find((user)=>String(user.id)===String(row.discord_user_id))?.discord_username||row.discord_user_id}</strong><span>{row.total_points} points</span></div>):<p>The first Elite Books champion will be crowned after {currentYear}.</p>}</aside></section><section className="elite-badge-gallery"><div className="elite-section-head"><div><span>TROPHY CASE</span><h2>Recognition System</h2></div></div><div>{[...defs.values()].map((badge)=><article key={badge.code}><EliteBadgeMark code={badge.code}/><strong>{badge.title}</strong><small>{badge.description}</small></article>)}</div></section></main>;
}

function MyTeamHub({linkedDiscordUser,discordSession,teams=[],users=[],assignments=[],results=[],weeklyMatchups=[],sportsbook={},currentYear,currentWeek,signInWithDiscord,setActiveTab}) {
  if(!discordSession||!linkedDiscordUser)return <main className="cfb-v2-page"><section className="elite-myteam-login"><span>PERSONALIZED LEAGUE HUB</span><h1>My Team</h1><p>Sign in with Discord to see your team, next opponent, sportsbook card, futures and badges in one place.</p><button onClick={signInWithDiscord}>Continue with Discord</button></section></main>;
  const assignment=assignments.find((row)=>String(row.discord_user_id)===String(linkedDiscordUser.id)&&assignmentActiveForYear(row,currentYear));
  const team=teams.find((row)=>String(row.id)===String(assignment?.team_id));
  const next=(weeklyMatchups||[]).find((row)=>String(row.season_year)===String(currentYear)&&String(row.week)===String(currentWeek)&&(String(row.team_1_id)===String(team?.id)||String(row.team_2_id)===String(team?.id)));
  const opponent=teams.find((row)=>String(row.id)===String(String(next?.team_1_id)===String(team?.id)?next?.team_2_id:next?.team_1_id));
  const season=(sportsbook.seasonStandings||[]).find((row)=>String(row.season_year)===String(currentYear)&&String(row.discord_user_id)===String(linkedDiscordUser.id));
  const futurePicks=(sportsbook.futurePicks||[]).filter((pick)=>String(pick.discord_user_id)===String(linkedDiscordUser.id));
  return <main className="cfb-v2-page"><section className="elite-myteam-hero" style={{"--my-primary":getTeamPrimary(team),"--my-secondary":getTeamSecondary(team)}}><TeamLogoMark team={team} size={120}/><div><span>{currentYear} PERSONAL HQ</span><h1>{team?.name||"Team assignment pending"}</h1><p>{linkedDiscordUser.discord_username}</p></div><button onClick={()=>setActiveTab?.(`coach-${linkedDiscordUser.id}`)}>Full Coach Profile →</button></section><section className="elite-myteam-grid"><article><span>NEXT UP • {currentWeek}</span>{next?<><div><TeamLogoMark team={opponent} size={74}/><strong>{opponent?.name}</strong></div><small>{next.scheduled_at?new Date(next.scheduled_at).toLocaleString():"Time TBD"}</small></>:<p>No current-week matchup listed.</p>}<button onClick={()=>setActiveTab?.("schedule")}>Open GameCenter</button></article><article><span>ELITE BOOKS</span><strong className="elite-myteam-points">{season?.total_points||0} PTS</strong><small>{season?.correct_picks||0} correct picks</small><button onClick={()=>setActiveTab?.("eliteBooks")}>Build My Card</button></article><article><span>MY FUTURES</span>{futurePicks.length?<b>{futurePicks.length} selection{futurePicks.length===1?"":"s"} locked</b>:<b>No futures selected</b>}<small>All current-year futures are also shown on your coach profile.</small><button onClick={()=>setActiveTab?.("eliteBooks")}>View Futures</button></article></section><EliteBadgeRail sportsbook={sportsbook} discordUserId={linkedDiscordUser.id} currentYear={currentYear}/></main>;
}

function EliteBooksManager({sportsbook={},users=[],teams=[],assignments=[],currentYear,currentWeek,advanceAt,busy,linkedDiscordUser,generateBoard,seedFutures,settleFuture,setMatchupLock,voidMatchup,updateSeed,updateTeamSeed,loadData}) {
  const [settlements,setSettlements]=useState({});
  const board=currentSportsbookBoard(sportsbook,currentYear,currentWeek);
  const currentLines=(sportsbook.lines||[]).filter((line)=>String(line.board_id)===String(board?.id));
  const markets=(sportsbook.markets||[]).filter((row)=>String(row.season_year)===String(currentYear));
  const teamFor=(id)=>teams.find((team)=>String(team.id)===String(id));
  const teamForUser=(userId)=>{const assignment=assignments.find((row)=>String(row.discord_user_id)===String(userId)&&assignmentActiveForYear(row,currentYear));return teamFor(assignment?.team_id);};
  return <main className="cfb-v2-page elite-books-manager-page">
    <div style={v2PageHero}><div><span style={v2Eyebrow}>COMMISSIONER OPERATIONS</span><h1 style={v2PageTitle}>Elite Books Manager</h1><p style={v2PageSub}>Generate the current board, manually close betting as games begin, open futures and settle season awards.</p></div><button style={v2GhostButton} onClick={loadData}>Refresh</button></div>
    {!linkedDiscordUser?.is_commissioner&&<div style={v2Notice}>For protected sportsbook writes, sign in with Discord and mark that linked user as <b>is_commissioner = true</b> in Supabase. The commissioner code remains an emergency UI lock.</div>}
    <section className="elite-manager-grid"><article><span>CURRENT BOARD</span><h2>{currentYear} • {currentWeek}</h2><p>{board?`${board.status.toUpperCase()} • ${currentLines.length} generated lines`:"No board generated yet"}</p><small>Lock deadline: {board?.locks_at||advanceAt?new Date(board?.locks_at||advanceAt).toLocaleString():"Not set"}</small><button disabled={busy} onClick={generateBoard}>{busy?"Working…":"Generate / Refresh Lines"}</button></article><article><span>SEASON FUTURES</span><h2>Four market system</h2><p>National Champion, conference champions, Heath Hurley COTY and—beginning in Season 2—Most Improved Team.</p><button disabled={busy} onClick={seedFutures}>{busy?"Working…":"Create / Refresh Futures"}</button></article></section>
    <section style={v2Panel}><div style={v2PanelHeader}><div><span style={v2Eyebrow}>LIVE BETTING CONTROL</span><h2>Matchup Locks</h2></div><small style={mutedText}>Lock betting when a game starts. If a game is never played, Void Matchup closes every wager for zero points.</small></div><div className="elite-matchup-locks">{currentLines.length?currentLines.map((line)=>{const t1=teamFor(line.team_1_id);const t2=teamFor(line.team_2_id);return <div key={line.id} className={`${line.is_betting_locked?"locked":""} ${line.voided_at?"voided":""}`}><span><TeamLogoMark team={t1} size={34}/><strong>{getTeamAbbreviation(t1)}</strong></span><b>VS</b><span><TeamLogoMark team={t2} size={34}/><strong>{getTeamAbbreviation(t2)}</strong></span><em>{line.voided_at?"VOIDED":line.is_betting_locked?`LOCKED${line.betting_locked_at?` • ${new Date(line.betting_locked_at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}`:""}`:"BETTING OPEN"}</em><div className="elite-matchup-actions"><button disabled={busy||Boolean(line.settled_at)} onClick={()=>setMatchupLock(line.id,!line.is_betting_locked)}>{line.is_betting_locked?"Reopen Betting":"Lock Betting"}</button><button className="void-matchup" disabled={busy||Boolean(line.settled_at)} onClick={()=>voidMatchup(line.id)}>Void Matchup</button></div></div>}):<div style={v2Empty}>Generate the current board to manage matchup locks.</div>}</div></section>
    <section style={v2Panel}><div style={v2PanelHeader}><div><span style={v2Eyebrow}>PRESEASON MODEL</span><h2>Coach & Team Foundation</h2></div><small style={mutedText}>Your imported user skill and team overall ratings drive the opening lines. Their influence automatically declines as actual results accumulate.</small></div><div className="elite-seed-grid">{users.filter((user)=>user.is_active!==false).map((user)=>{const team=teamForUser(user.id);return <article key={user.id}><div><TeamLogoMark team={team} size={40}/><span><strong>{user.discord_username}</strong><small>{team?.name||"No active team"}</small></span></div><label><span>User Skill</span><input type="number" min="1" max="99" defaultValue={user.sportsbook_seed||50} onBlur={(event)=>updateSeed(user.id,event.target.value)}/></label><label><span>Team OVR</span><input type="number" min="1" max="99" disabled={!team} defaultValue={team?.sportsbook_team_seed||70} onBlur={(event)=>team&&updateTeamSeed(team.id,event.target.value)}/></label>{user.sportsbook_notes&&<p>{user.sportsbook_notes}</p>}</article>})}</div></section>
    <section style={v2Panel}><div style={v2PanelHeader}><div><span style={v2Eyebrow}>FUTURES SETTLEMENT</span><h2>Declare Winners</h2></div></div><div className="elite-manager-markets">{markets.map((market)=>{const options=(sportsbook.options||[]).filter((row)=>String(row.market_id)===String(market.id));return <div key={market.id}><span><strong>{market.title}</strong><small>{market.status}</small></span><select value={settlements[market.id]||""} onChange={(event)=>setSettlements({...settlements,[market.id]:event.target.value})}><option value="">Select winner…</option>{options.map((option)=><option key={option.id} value={option.id}>{option.selection_label}</option>)}</select><button disabled={!settlements[market.id]||market.status==="settled"} onClick={()=>settleFuture(market.id,settlements[market.id])}>Settle</button></div>})}{!markets.length&&<div style={v2Empty}>Create the season futures first.</div>}</div></section>
  </main>;
}

function NetworkHomePanel({linkedDiscordUser,setActiveTab}) {
  const [pulse,setPulse]=useState({live:0,unread:0,announcement:null});
  useEffect(()=>{let active=true;async function load(){const [statusRes,notificationRes,channelRes]=await Promise.all([supabase.from("live_stream_status").select("profile_id").eq("is_live",true),supabase.from("app_notifications").select("id").is("read_at",null),supabase.from("league_channels").select("id").eq("slug","announcements").maybeSingle()]);let announcement=null;if(channelRes.data?.id){const messageRes=await supabase.from("league_channel_messages").select("body,created_at").eq("channel_id",channelRes.data.id).is("deleted_at",null).order("created_at",{ascending:false}).limit(1);announcement=messageRes.data?.[0]||null;}if(active)setPulse({live:statusRes.data?.length||0,unread:notificationRes.data?.length||0,announcement});}load();const timer=window.setInterval(load,NETWORK_REFRESH_MS);return()=>{active=false;window.clearInterval(timer);};},[linkedDiscordUser?.id]);
  return <section className="network-home-panel"><button onClick={()=>setActiveTab?.("leagueHub")}><span>LEAGUE HUB</span><h2>{pulse.announcement?.body||"The league conversation lives here."}</h2><small>{pulse.announcement?`Latest announcement • ${new Date(pulse.announcement.created_at).toLocaleDateString()}`:"Channels, private messages, announcements and alerts"}</small><b>Enter the Hub →</b></button><button onClick={()=>setActiveTab?.("leagueHub")}><span>MY INBOX</span><strong>{pulse.unread}</strong><small>Unread notification{pulse.unread===1?"":"s"}</small></button><button className={pulse.live?"live":""} onClick={()=>setActiveTab?.("redZone")}><span>REDZONE</span><strong>{pulse.live}</strong><small>{pulse.live?"League streams live now":"Streams currently live"}</small><b>{pulse.live?"Watch Now →":"Open Control Room →"}</b></button></section>;
}

function DashboardV2({ teams = [], users = [], assignments = [], results = [], allResults = [], weeklyMatchups = [], conferenceAssets = [], allAmericans = [], awards = [], heismans = [], nationalChampions = [], recruiting = [], teamSeasonStats = [], currentYear, currentWeek, advanceAt, setCurrentYear, setCurrentWeek, saveSettings, goToTeam, setActiveTab, rankingSnapshots = [], adminUnlocked = false, sportsbook = {}, linkedDiscordUser = null }) {
  const now=useLiveClock(30000);
  const countdown=countdownParts(advanceAt,now);
  const seasonResults=(allResults||results||[]).filter((row)=>String(row.season_year)===String(currentYear));
  const rankings=computerRankingRows(teams,seasonResults,assignments,users);
  const previousMap=previousRankingMap(rankingSnapshots,currentYear,currentWeek);
  const topCoach=rankings.find((row)=>assignedCoachName(row.team.id,null,users,assignments,currentYear)!=="User TBD")||rankings[0];
  const prestigeRows=typeof dynastyPrestigeRows==="function"?dynastyPrestigeRows(teams,assignments,allResults,allAmericans,awards,heismans,nationalChampions,recruiting,teamSeasonStats).slice(0,5):[];
  const wire=typeof dynastyWireItems==="function"?dynastyWireItems({rankingDetails:rankings.map((row)=>({...row,record:recordFromResults(row.team.id,seasonResults),user:assignedCoachName(row.team.id,null,users,assignments,currentYear)})),results:allResults,teams,recruiting,prestigeRows,currentYear}):[];
  const visibleRankings=rankings;
  const topUsers=rankings.slice(0,3).map((row)=>({name:assignedCoachName(row.team.id,null,users,assignments,currentYear),detail:`#${row.rank} ${row.teamName}`,value:row.rating.toFixed(1),team:row.team}));
  const conferenceRows=conferencePowerData({teams,users,assignments,results:seasonResults,allResults,allAmericans,awards,heismans,nationalChampions,recruiting});
  const topConferences=conferenceRows.slice(0,3).map((row,index)=>({name:row.conference,conference:row.conference,detail:`#${index+1} Conference`,value:row.power.toFixed(1)}));
  const topSor=[...rankings].filter((row)=>row.games>0).sort((a,b)=>b.sor-a.sor).slice(0,3).map((row)=>({name:row.teamName,detail:assignedCoachName(row.team.id,null,users,assignments,currentYear),value:row.sor.toFixed(1),team:row.team}));
  const topAvgPf=[...rankings].filter((row)=>row.games>0).sort((a,b)=>b.avgPf-a.avgPf).slice(0,3).map((row)=>({name:row.teamName,detail:assignedCoachName(row.team.id,null,users,assignments,currentYear),value:row.avgPf.toFixed(1),team:row.team}));
  const topAvgPa=[...rankings].filter((row)=>row.games>0).sort((a,b)=>a.avgPa-b.avgPa).slice(0,3).map((row)=>({name:row.teamName,detail:assignedCoachName(row.team.id,null,users,assignments,currentYear),value:row.avgPa.toFixed(1),team:row.team}));

  return <main className="cfb-v2-page" style={v2Page}>
    <section className="cfb-v2-dashboard-hero" style={v2DashboardHero}>
      <div><span style={v2Eyebrow}>CFBELITE 27 • DYNASTY HQ</span><h1 style={v2DashboardTitle}>This Week in CFBElite</h1><p style={v2PageSub}>{currentYear} season • {currentWeek} • Live league operations and competition hub</p></div>
      <div style={v2AdvanceCard}><span>Next Advancement</span><b>{countdown?.label||"Not scheduled"}</b><small>{advanceAt?new Date(advanceAt).toLocaleString():"Commissioner can set the deadline"}</small></div>
      {adminUnlocked&&<div style={v2HeroControls}><select value={currentYear} onChange={(e)=>setCurrentYear(e.target.value)} style={v2Input}>{YEARS.map((year)=><option key={year}>{year}</option>)}</select><select value={currentWeek} onChange={(e)=>setCurrentWeek(e.target.value)} style={v2Input}>{WEEKS.map((week)=><option key={week}>{week}</option>)}</select><button style={v2PrimaryButton} onClick={saveSettings}>Save League Week</button></div>}
    </section>

    <CurrentWeekTicker teams={teams} weeklyMatchups={weeklyMatchups} results={allResults} currentYear={currentYear} currentWeek={currentWeek} setActiveTab={setActiveTab}/>

    <NetworkHomePanel linkedDiscordUser={linkedDiscordUser} setActiveTab={setActiveTab}/>

    <EliteBooksHomePanel sportsbook={sportsbook} linkedDiscordUser={linkedDiscordUser} currentYear={currentYear} currentWeek={currentWeek} setActiveTab={setActiveTab}/>

    <section className="cfb-v2-leader-grid" style={v2LeaderGrid}>
      <V2LeaderTile label="Top 3 Ranked Users" rows={topUsers} metric="Rating"/>
      <V2LeaderTile label="Top 3 Conferences" rows={topConferences} metric="Power" conferenceAssets={conferenceAssets}/>
      <V2LeaderTile label="Top 3 SOR" rows={topSor} metric="SOR"/>
      <V2LeaderTile label="Top 3 Avg PF" rows={topAvgPf} metric="PF"/>
      <V2LeaderTile label="Top 3 Avg PA" rows={topAvgPa} metric="PA"/>
    </section>

    <section style={v2Panel}>
        <div className="cfb-v2-table-panel-head" style={v2PanelHeader}><div><span style={v2Eyebrow}>LIVE LADDER</span><h2>Automatic Rankings</h2></div><span className="cfb-v2-active-count" style={v2CountPill}>{rankings.length} Active Teams</span></div>
        <div style={v2RankingTableScroll}>
          <div className="cfb-v2-ranking-head" style={v2RankingTableHead}><span>Rank</span><span>Team / User</span><span>Move</span><span>Record</span><span>SOR</span><span>Rating</span><span>Avg PA</span><span>Avg PF</span><span>Top 10 Wins</span></div>
          <div style={v2RankingList}>{visibleRankings.map((row)=><button className="cfb-v2-ranking-row" key={row.team.id} style={{...v2RankingRow,borderColor:`${getTeamSecondary(row.team)}44`}} onClick={()=>goToTeam?.(row.team.id)}><b>#{row.rank}</b><span style={v2RankingIdentity}><span style={v2RankingLogo}><TeamLogoMark team={row.team} size={38}/></span><span style={v2RankingTeam}><strong>{row.teamName}</strong><small>{assignedCoachName(row.team.id,null,users,assignments,currentYear)}</small></span></span><RankingMovement currentRank={row.rank} previousRank={previousMap.get(String(row.team.id))}/><span>{row.wins}-{row.losses}</span><span>{row.sor.toFixed(1)}</span><strong>{row.rating.toFixed(1)}</strong><span>{row.avgPa.toFixed(1)}</span><span>{row.avgPf.toFixed(1)}</span><span>{row.top10}</span></button>)}</div>
        </div>
    </section>

    <section style={v2Panel}>
      <div className="cfb-v2-table-panel-head" style={v2PanelHeader}><div><span style={v2Eyebrow}>CONFERENCE REPORT</span><h2>Conference Power Rankings</h2></div><button style={v2TextButton} onClick={()=>setActiveTab?.("conferencePower")}>Full Conference Page →</button></div>
      <div className="cfb-v2-conference-scroll" style={v2ConferenceTableScroll}>
        <div className="cfb-v2-conference-head" style={v2ConferenceTableHead}><span>#</span><span>Conference</span><span>Power</span><span>Performance</span><span>User ELO</span><span>Titles</span><span>Recruiting</span><span>Recognition</span><span>Record</span><span>Users</span></div>
        {conferenceRows.map((row,index)=><div className="cfb-v2-conference-row" key={row.conference} style={v2ConferenceTableRow}><b>#{index+1}</b><span style={v2ConferenceIdentity}><ConferenceLogoMark conference={row.conference} conferenceAssets={conferenceAssets} size={34}/><strong>{row.conference}</strong></span><strong>{row.power.toFixed(1)}</strong><span>{row.currentPerformanceScore.toFixed(1)}</span><span>{row.userStrength.toFixed(1)}</span><span>{row.championshipScore.toFixed(1)}</span><span>{row.recruitingAvg.toFixed(1)}</span><span>{row.recognitionScore.toFixed(1)}</span><span>{row.recordWins}-{row.recordLosses}</span><span>{row.teams}</span></div>)}
      </div>
    </section>

    <section className="cfb-v2-home-grid" style={v2HomeGrid}>
      <div style={v2Panel}><div style={v2PanelHeader}><div><span style={v2Eyebrow}>COACH SPOTLIGHT</span><h2>League Leader</h2></div></div>{topCoach?<div style={v2CoachSpotlight}><TeamLogoMark team={topCoach.team} size={92} plate/><div><span>{topCoach.teamName}</span><h3>{assignedCoachName(topCoach.team.id,null,users,assignments,currentYear)}</h3><p>Currently ranked #{topCoach.rank} with a {topCoach.wins}-{topCoach.losses} record, {topCoach.sor.toFixed?.(1)||topCoach.sor} SOR, and a {topCoach.rating.toFixed(1)} automatic rating.</p></div></div>:<div style={v2Empty}>No rankings available yet.</div>}</div>
      <div style={v2Panel}><div style={v2PanelHeader}><div><span style={v2Eyebrow}>DYNASTY WIRE</span><h2>League Headlines</h2></div></div><div style={v2WireList}>{wire.slice(0,6).map((item,index)=><div key={index}><span>{item.icon||"🏈"}</span><div><b>{item.title}</b><small>{item.meta}</small></div></div>)}</div></div>
    </section>
  </main>;
}

function V2Kpi({label,value,sub,tone}) {
  return <div style={{...v2Kpi,borderTopColor:tone}}><span>{label}</span><b>{value}</b><small>{sub}</small></div>;
}

function V2LeaderTile({label,rows=[],metric,conferenceAssets=[]}) {
  return <article style={v2LeaderTile}><div style={v2LeaderHeader}><span>{label}</span><small>{metric}</small></div><div style={v2LeaderRows}>{rows.length?rows.map((row,index)=><div key={`${label}-${row.name}-${index}`} style={v2LeaderRow}><b>{index+1}</b>{row.team?<span style={v2LeaderLogo}><TeamLogoMark team={row.team} size={26}/></span>:row.conference?<span style={v2LeaderLogo}><ConferenceLogoMark conference={row.conference} conferenceAssets={conferenceAssets} size={26}/></span>:<span style={v2LeaderMonogram}>{String(row.name||"?").slice(0,2).toUpperCase()}</span>}<span style={v2LeaderText}><strong>{row.name}</strong><small>{row.detail}</small></span><em style={v2LeaderValue}>{row.value}</em></div>):<div style={v2LeaderEmpty}>No games recorded</div>}</div></article>;
}

function PlayoffPictureV2({teams=[],users=[],assignments=[],results=[],currentYear,setActiveTab}) {
  const seasonResults=results.filter((row)=>String(row.season_year)===String(currentYear));
  const activeIds=new Set(assignments.filter((row)=>row.status==="Active"&&row.team_id).map((row)=>String(row.team_id)));
  const ranked=computerRankingRows(teams.filter((team)=>!activeIds.size||activeIds.has(String(team.id))),seasonResults,assignments,users).slice(0,12);
  const byes=ranked.slice(0,4);
  const games=[[ranked[4],ranked[11]],[ranked[5],ranked[10]],[ranked[6],ranked[9]],[ranked[7],ranked[8]]].filter(([a,b])=>a&&b);
  const bubble=computerRankingRows(teams.filter((team)=>!activeIds.size||activeIds.has(String(team.id))),seasonResults,assignments,users).slice(12,17);
  return <main className="cfb-v2-page" style={v2Page}>
    <div style={v2PageHero}><div><span style={v2Eyebrow}>POSTSEASON PROJECTION • {currentYear}</span><h1 style={v2PageTitle}>Playoff Picture</h1><p style={v2PageSub}>A live 12-team projection based on the CFBElite automatic rankings. This is a projection, not an official selection.</p></div><button style={v2PrimaryButton} onClick={()=>setActiveTab?.("dashboard")}>Back to Home</button></div>
    <section style={v2Panel}><div style={v2PanelHeader}><div><span style={v2Eyebrow}>TOP FOUR</span><h2>Projected First-Round Byes</h2></div></div><div className="cfb-v2-bye-grid" style={v2ByeGrid}>{byes.map((row)=><div key={row.team.id} style={{...v2SeedCard,background:`linear-gradient(145deg,${getTeamPrimary(row.team)}aa,rgba(2,6,23,.98))`,borderColor:`${getTeamSecondary(row.team)}66`}}><b>#{row.rank}</b><TeamLogoMark team={row.team} size={74} plate/><strong>{row.teamName}</strong><span>{row.wins}-{row.losses} • {row.rating.toFixed(1)}</span><small>{assignedCoachName(row.team.id,null,users,assignments,currentYear)}</small></div>)}</div></section>
    <section style={v2Panel}><div style={v2PanelHeader}><div><span style={v2Eyebrow}>FIRST ROUND</span><h2>Projected Matchups</h2></div></div><div className="cfb-v2-playoff-grid" style={v2PlayoffGrid}>{games.map(([high,low])=><div key={`${high.team.id}-${low.team.id}`} style={v2PlayoffGame}><V2MatchupTeam team={low.team} rank={low.rank} user={assignedCoachName(low.team.id,null,users,assignments,currentYear)} compact/><div style={v2PlayoffAt}>AT</div><V2MatchupTeam team={high.team} rank={high.rank} user={assignedCoachName(high.team.id,null,users,assignments,currentYear)} compact/></div>)}</div></section>
    <section style={v2Panel}><div style={v2PanelHeader}><div><span style={v2Eyebrow}>ON THE BUBBLE</span><h2>First Teams Out</h2></div></div><div style={v2BubbleList}>{bubble.length?bubble.map((row)=><div key={row.team.id}><b>#{row.rank}</b><TeamLogoMark team={row.team} size={36}/><span>{row.teamName}</span><small>{row.wins}-{row.losses} • {row.rating.toFixed(1)}</small></div>):<div style={v2Empty}>The playoff picture will populate after rankings are available.</div>}</div></section>
  </main>;
}

function MediaCenterV2({teams=[],users=[],assignments=[],results=[],weeklyMatchups=[],currentYear,currentWeek}) {
  const [notice,setNotice]=useState("");
  const seasonResults=results.filter((row)=>String(row.season_year)===String(currentYear));
  const rankings=computerRankingRows(teams,seasonResults,assignments,users);
  const rankMap=new Map(rankings.map((row)=>[String(row.team.id),row.rank]));
  const weekRows=weeklyMatchups.filter((row)=>String(row.season_year)===String(currentYear)&&String(row.week)===String(currentWeek)).map((row)=>{
    const team1=row.team_1||teams.find((team)=>String(team.id)===String(row.team_1_id)); const team2=row.team_2||teams.find((team)=>String(team.id)===String(row.team_2_id));
    return {...row,team1,team2,result:scheduledResultFor(row,seasonResults,currentYear),rank1:rankMap.get(String(row.team_1_id)),rank2:rankMap.get(String(row.team_2_id)),user1:assignedCoachName(row.team_1_id,row.team_1_user_id,users,assignments,currentYear),user2:assignedCoachName(row.team_2_id,row.team_2_user_id,users,assignments,currentYear)};
  });
  const weeklyPost=[`🏈 CFBElite 27 • ${currentYear} ${currentWeek}`,"",...weekRows.map((row)=>row.result?`FINAL: ${row.team1?.name} ${scoreForScheduledTeam(row.result,row.team_1_id)} - ${scoreForScheduledTeam(row.result,row.team_2_id)} ${row.team2?.name}`:`UPCOMING: ${row.team1?.name} vs ${row.team2?.name}`),"","Automatic Top 5:",...rankings.slice(0,5).map((row)=>`${row.rank}. ${row.teamName} (${row.wins}-${row.losses})`)].join("\n");
  return <main className="cfb-v2-page" style={v2Page}>
    <div style={v2PageHero}><div><span style={v2Eyebrow}>LEAGUE CONTENT STUDIO</span><h1 style={v2PageTitle}>Media Center</h1><p style={v2PageSub}>Generate clean, Discord-ready graphics and posts directly from current league data.</p></div><div style={v2InlineActions}><button style={v2PrimaryButton} onClick={()=>downloadRankingsGraphic(rankings,currentYear,currentWeek)}>Download Top 10 Graphic</button><button style={v2GhostButton} onClick={async()=>setNotice(await copyLeagueText(weeklyPost)?"Weekly Discord recap copied.":"Copy was blocked by the browser.")}>Copy Weekly Recap</button></div></div>
    {notice&&<div style={v2Notice}>{notice}</div>}
    <section style={v2Panel}><div style={v2PanelHeader}><div><span style={v2Eyebrow}>{currentWeek}</span><h2>Matchup and Final Graphics</h2></div><span style={v2CountPill}>{weekRows.length}</span></div><div className="cfb-v2-media-grid" style={v2MediaGrid}>{weekRows.length?weekRows.map((row)=><div key={row.id} style={{...v2MediaCard,background:`linear-gradient(135deg,${getTeamPrimary(row.team1)}88,rgba(2,6,23,.98),${getTeamPrimary(row.team2)}66)`}}><div style={v2CardMatchup}><V2MatchupTeam team={row.team1} rank={row.rank1} user={row.user1} compact/><div style={v2CardScore}>{row.result?<b>{scoreForScheduledTeam(row.result,row.team_1_id)}–{scoreForScheduledTeam(row.result,row.team_2_id)}</b>:<b>VS</b>}</div><V2MatchupTeam team={row.team2} rank={row.rank2} user={row.user2} compact/></div><button style={v2PrimaryButton} onClick={()=>downloadMatchupGraphic({...row,seasonYear:currentYear,label:row.result?"FINAL SCORE":"WEEKLY MATCHUP"})}>Download {row.result?"Final Score":"Matchup"} Graphic</button></div>):<div style={v2Empty}>No matchups scheduled for {currentWeek}.</div>}</div></section>
    <section style={v2Panel}><div style={v2PanelHeader}><div><span style={v2Eyebrow}>COPY AND POST</span><h2>Weekly Discord Recap</h2></div><button style={v2TextButton} onClick={async()=>setNotice(await copyLeagueText(weeklyPost)?"Weekly Discord recap copied.":"Copy was blocked by the browser.")}>Copy Text</button></div><pre style={v2RecapPreview}>{weeklyPost}</pre></section>
  </main>;
}

function DashboardRedesign({ teams, users, assignments, results, allResults, weeklyMatchups = [], conferenceAssets = [], allAmericans, awards, heismans, nationalChampions, recruiting, teamSeasonStats, currentYear, currentWeek, setCurrentYear, setCurrentWeek, saveSettings, goToTeam, setActiveTab, sortState, setSortState }) {
  const [rankingSort, setRankingSort] = useState({ key: "rating", direction: "desc" });
  const activeAssignments = activeAssignmentsForLeague(assignments, teams);
  const activeCoachCount = activeAssignments.length;
  const currentSeasonResults = results.filter((r)=>String(r.season_year)===String(currentYear));
  const rankings = computerRankingRows(teams, currentSeasonResults, assignments, users);
  const prestigeRows = typeof dynastyPrestigeRows === "function" ? dynastyPrestigeRows(teams, assignments, allResults, allAmericans, awards, heismans, nationalChampions, recruiting, teamSeasonStats).slice(0,5) : [];

  const dashboardWeek = String(currentWeek || "Week 1");
  const dashboardRankMap = new Map(rankings.map((item,index)=>[String(item.team?.id), index+1]));
  const dashboardScheduleRows = (weeklyMatchups || [])
    .filter((row)=>String(row.season_year) === "2026")
    .map((row)=>{
      const team1 = row.team_1 || teams.find((team)=>String(team.id)===String(row.team_1_id));
      const team2 = row.team_2 || teams.find((team)=>String(team.id)===String(row.team_2_id));
      const result = (allResults || []).find((game)=>
        String(game.season_year) === "2026" &&
        String(game.week) === String(row.week) &&
        (
          (String(game.team_1_id)===String(row.team_1_id) && String(game.team_2_id)===String(row.team_2_id)) ||
          (String(game.team_1_id)===String(row.team_2_id) && String(game.team_2_id)===String(row.team_1_id))
        )
      );
      return { ...row, team1, team2, result, rank1:dashboardRankMap.get(String(row.team_1_id)) || "—", rank2:dashboardRankMap.get(String(row.team_2_id)) || "—" };
    })
    .sort((a,b)=>Number(String(a.week).replace(/\D/g,""))-Number(String(b.week).replace(/\D/g,"")));
  const dashboardWeeks = Array.from({length:14},(_,index)=>`Week ${index}`);
  const dashboardCurrentWeekRows = dashboardScheduleRows.filter((row)=>String(row.week)===dashboardWeek);
  const dashboardGameOfWeek = dashboardCurrentWeekRows.find((row)=>row.is_game_of_week) || [...dashboardCurrentWeekRows].sort((a,b)=>{
    const aScore=(Number(a.rank1)||99)+(Number(a.rank2)||99);
    const bScore=(Number(b.rank1)||99)+(Number(b.rank2)||99);
    return aScore-bScore;
  })[0] || null;

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

  const conferenceSnapshotRows = Array.from(new Set(teams.map((team)=>normalizeDraftConference(team.conference) || cleanConference(team.conference)).filter(Boolean)))
    .map((conference)=>{
      const confTeams = teams.filter((team)=>(normalizeDraftConference(team.conference) || cleanConference(team.conference)) === conference);
      const confRankingRows = rankingDetails.filter((row)=>confTeams.some((team)=>team.id === row.team?.id));
      const confResults = confTeams.map((team)=>recordFromResults(team.id, currentSeasonResults));
      const wins = confResults.reduce((sum,row)=>sum + Number(row.wins || 0), 0);
      const losses = confResults.reduce((sum,row)=>sum + Number(row.losses || 0), 0);
      const avgRating = confRankingRows.length ? confRankingRows.reduce((sum,row)=>sum + Number(row.rating || 0), 0) / confRankingRows.length : 0;
      const avgRank = confRankingRows.length ? confRankingRows.reduce((sum,row)=>sum + Number(row.rank || 0),0) / confRankingRows.length : 0;
      const top10 = confRankingRows.filter((row)=>Number(row.rank)<=10).length;
      const games = wins + losses;
      const winPct = games ? (wins / games) * 100 : 0;
      const topTeam = [...confRankingRows].sort((a,b)=>Number(a.rank)-Number(b.rank))[0];
      return { conference, teams:confTeams.length, wins, losses, avgRating:Number(avgRating.toFixed(1)), avgRank:Number(avgRank.toFixed(1)), top10, winPct:Number(winPct.toFixed(1)), topTeam };
    })
    .sort((a,b)=>b.avgRating-a.avgRating || b.wins-a.wins)
    .slice(0,6);

  const recentResultsRows = [...currentSeasonResults]
    .filter((row)=>row.team_1_id && row.team_2_id)
    .slice(0,6)
    .map((row)=>{
      const team1 = row.team_1 || teams.find((team)=>team.id===row.team_1_id);
      const team2 = row.team_2 || teams.find((team)=>team.id===row.team_2_id);
      const score1 = Number(row.team_1_score || 0);
      const score2 = Number(row.team_2_score || 0);
      const winner = score1 > score2 ? team1 : score2 > score1 ? team2 : null;
      return { ...row, team1, team2, winner, score1, score2 };
    });

  const coachSpotlight = (() => {
    const candidate = rankingDetails.find((row)=>row.user && row.user !== "CPU") || rankingDetails[0];
    if (!candidate) return null;
    const coachResults = currentSeasonResults.filter((row)=>row.team_1_id === candidate.team?.id || row.team_2_id === candidate.team?.id);
    let streak = 0;
    for (const row of [...coachResults].reverse()) {
      const isTeam1 = row.team_1_id === candidate.team?.id;
      const pf = Number(isTeam1 ? row.team_1_score : row.team_2_score);
      const pa = Number(isTeam1 ? row.team_2_score : row.team_1_score);
      if (pf > pa) streak += 1;
      else break;
    }
    const headline = candidate.rank === 1
      ? `${candidate.teamName || candidate.team?.name} sets the pace at #1 in the CFBElite Automatic Rankings.`
      : `${candidate.teamName || candidate.team?.name} owns one of the league's strongest résumés entering ${currentWeek}.`;
    return { ...candidate, streak, headline };
  })();

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
        <div style={dashboardTableHeadPro} className="cfb-dashboard-power-table-head">
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
                <span style={dashboardTeamCellPro}><TeamBroadcastMark team={team} name={row.teamName || team?.name} size={56}/></span>
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

      <section style={dashboardFeatureGridV89} className="cfb-dashboard-feature-grid-v89">
        <div style={coachSpotlightCardV64}>
          <div style={dashboardPanelHeaderPro}><span>COACH SPOTLIGHT</span><h2>Featured Coach</h2></div>
          {coachSpotlight ? (
            <div style={coachSpotlightInnerV64}>
              <TeamLogoMark team={coachSpotlight.team} size={86} plate/>
              <div style={coachSpotlightTextV64}>
                <span style={coachSpotlightTeamLineV66}>{getTeamAbbreviation(coachSpotlight.team)} • {coachSpotlight.teamName || coachSpotlight.team?.name}</span>
                <h3>{coachSpotlight.user}</h3>
                <p>{coachSpotlight.headline}</p>
                <div style={coachSpotlightStatsV64}>
                  <b>#{coachSpotlight.rank}</b>
                  <small>{coachSpotlight.record.wins}-{coachSpotlight.record.losses}</small>
                  <small>SOR {coachSpotlight.sor}</small>
                  <small>{coachSpotlight.top10} Top 10 Wins</small>
                </div>
              </div>
            </div>
          ) : <div style={mutedText}>No coach spotlight yet.</div>}
        </div>

        <div style={dashboardConferencePowerWideV89}>
          <div style={dashboardPanelHeaderPro}><span>CONFERENCE POWER</span><h2>League Snapshot</h2></div>
          <div className="cfb-conference-power-head-v89" style={dashboardConferenceHeadV89}>
            <span>Rank</span><span>Conference</span><span>Top Team</span><span>Avg Rank</span><span>Top 10</span><span>Record</span><span>Win %</span><span>Rating</span>
          </div>
          <div style={dashboardConferenceRowsV89}>
            {conferenceSnapshotRows.length ? conferenceSnapshotRows.map((row,index)=>(
              <div key={row.conference} className="cfb-conference-power-row-v89" style={{...dashboardConferenceRowV89, background:`linear-gradient(90deg, ${getTeamPrimary(row.topTeam?.team)}44, rgba(15,23,42,.94))`, borderColor:`${getTeamSecondary(row.topTeam?.team)}55`}}>
                <b>#{index+1}</b>
                <span style={dashboardConferenceLogoCellV90} title={row.conference}>
                  <ConferenceLogoMark conference={row.conference} conferenceAssets={conferenceAssets} size={34}/>
                </span>
                <span style={dashboardConferenceTopV66}>{row.topTeam?.team ? <><TeamLogoMark team={row.topTeam.team} size={24}/>{getTeamAbbreviation(row.topTeam.team)}</> : "—"}</span>
                <span>{row.avgRank || "—"}</span><span>{row.top10}</span><span>{row.wins}-{row.losses}</span><span>{row.winPct}%</span><strong>{row.avgRating}</strong>
                <div className="cfb-conference-mobile-metrics-v91" style={dashboardConferenceMobileMetricsV91}>
                  <span><small>AVG RANK</small><b>{row.avgRank || "—"}</b></span>
                  <span><small>TOP 10</small><b>{row.top10}</b></span>
                  <span><small>RECORD</small><b>{row.wins}-{row.losses}</b></span>
                  <span><small>WIN %</small><b>{row.winPct}%</b></span>
                  <span><small>RATING</small><b>{row.avgRating}</b></span>
                </div>
              </div>
            )) : <div style={mutedText}>No conference data yet.</div>}
          </div>
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

      <section style={dashboardSchedulePanelV89}>
        <div style={dashboardPanelHeaderPro}><span>SEASON HUB</span><h2>GAMECENTER</h2></div>
        {dashboardGameOfWeek && (
          <button style={{...dashboardGameOfWeekV87, background:`linear-gradient(135deg, ${getTeamPrimary(dashboardGameOfWeek.team1)}88, rgba(2,6,23,.96), ${getTeamPrimary(dashboardGameOfWeek.team2)}66)`}} onClick={()=>setActiveTab?.("schedule")}>
            <div style={dashboardGameEyebrowV87}>★ GAME OF THE WEEK • {dashboardGameOfWeek.week}</div>
            <div style={dashboardMatchupRowV87}>
              <div style={dashboardMatchupTeamV87}><b>#{dashboardGameOfWeek.rank1}</b><TeamLogoMark team={dashboardGameOfWeek.team1} size={54}/><span>{getTeamAbbreviation(dashboardGameOfWeek.team1)}</span></div>
              <strong>{dashboardGameOfWeek.result ? "FINAL" : "VS"}</strong>
              <div style={dashboardMatchupTeamV87}><b>#{dashboardGameOfWeek.rank2}</b><TeamLogoMark team={dashboardGameOfWeek.team2} size={54}/><span>{getTeamAbbreviation(dashboardGameOfWeek.team2)}</span></div>
            </div>
          </button>
        )}
        <div className="cfb-dashboard-season-weeks-v89" style={dashboardSeasonWeeksV89}>
          {dashboardWeeks.map((week)=>{
            const weekRows = dashboardScheduleRows.filter((row)=>String(row.week)===week);
            return (
              <div key={week} style={dashboardWeekGroupV89}>
                <div style={dashboardWeekHeaderV89}><b>{week}</b><span>{weekRows.length} game{weekRows.length===1?"":"s"}</span></div>
                <div style={dashboardWeekGamesV89}>
                  {weekRows.length ? weekRows.map((row)=>(
                    <button key={row.id || `${row.week}-${row.team_1_id}-${row.team_2_id}`} style={dashboardScheduleCardV89} onClick={()=>setActiveTab?.("schedule")}>
                      <div style={dashboardScheduleSideV90}><b>#{row.rank1}</b><TeamLogoMark team={row.team1} size={34}/><span>{getTeamAbbreviation(row.team1)}</span></div>
                      <strong>{row.result ? "FINAL" : "VS"}</strong>
                      <div style={dashboardScheduleSideV90}><b>#{row.rank2}</b><TeamLogoMark team={row.team2} size={34}/><span>{getTeamAbbreviation(row.team2)}</span></div>
                    </button>
                  )) : <small style={mutedText}>No user games.</small>}
                </div>
              </div>
            );
          })}
        </div>
        <button style={dashboardScheduleLinkV87} onClick={()=>setActiveTab?.("schedule")}>Open Full GameCenter →</button>
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


function ConferencePowerRankings({ teams, users, assignments, results, allResults = [], conferenceAssets = [], allAmericans = [], awards = [], heismans = [], nationalChampions = [], recruiting = [] }) {
  const activeAssignments = assignments.filter((assignment)=>assignment.status === "Active" && assignment.team_id && assignment.discord_user_id);
  const activeTeamIds = new Set(activeAssignments.map((assignment)=>String(assignment.team_id)));
  const activeTeams = teams.filter((team)=>activeTeamIds.has(String(team.id)));
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
            <td style={teamCell}><span style={v2ConferenceIdentity}><ConferenceLogoMark conference={row.conference} conferenceAssets={conferenceAssets} size={34}/><strong>{row.conference}</strong></span></td>
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

  return <div style={miniCard}><h3 style={miniTitle}>Backup / Export CSV</h3><p style={mutedText}>Commissioner-only quick exports for backup or audit purposes.</p><div style={actionRow}>{exports.map(([filename, rows])=><button key={filename} type="button" style={v2GhostButton} onClick={()=>downloadCsv(filename, rows)}>{filename}</button>)}</div></div>;
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
  "Army Black Knights","Charlotte 49ers","East Carolina Pirates","Florida Atlantic Owls","Memphis Tigers","Navy Midshipmen","North Texas Mean Green","Rice Owls","South Florida Bulls","USF Bulls","Temple Owls","Tulane Green Wave","Tulsa Golden Hurricane","Tulsa Golden Hurricanes","UAB Blazers","UTSA Roadrunners","UConn Huskies","UCONN Huskies",
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

function draftNormalizeNil(value, maxValue) {
  const n = draftNumberValue(value, 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(0, Math.min(100, (n / maxValue) * 100));
}

function formatNilBudget(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

function getPipelineGrade(team) {
  const raw = team?.pipeline_grade ?? team?.draft_pipeline_grade ?? team?.pipeline_rating;
  if (raw === "" || raw === null || raw === undefined) return "—";
  const n = Number(raw);
  return Number.isFinite(n) ? Number(n.toFixed(1)) : "—";
}

function getStartingNil(team) {
  return team?.starting_nil ?? team?.draft_starting_nil ?? team?.available_nil;
}

function getOverallNilBudget(team) {
  return team?.overall_nil_budget ?? team?.draft_nil_budget ?? team?.nil_budget;
}

function draftPrestigeValue(team) {
  const raw = team?.draft_prestige ?? team?.school_prestige ?? team?.prestige_grade ?? team?.prestige ?? "";
  if (raw === "" || raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.min(5, n)) : null;
}

function draftPrestigeStars(team) {
  const value = draftPrestigeValue(team);
  if (value === null) return "—";
  const fullStars = Math.floor(value);
  const hasHalf = value % 1 >= 0.5;
  const emptyStars = Math.max(0, 5 - fullStars - (hasHalf ? 1 : 0));
  return `${"★".repeat(fullStars)}${hasHalf ? "★" : ""}${"☆".repeat(emptyStars)}`;
}

function PrestigeStars({ team, size = 15 }) {
  const value = draftPrestigeValue(team);
  if (value === null) return <span>—</span>;

  return (
    <span style={prestigeStarsWrapV57} aria-label={`${value} star prestige`}>
      {[0,1,2,3,4].map((index)=>{
        const fill = Math.max(0, Math.min(1, value - index));
        return (
          <span key={index} style={{...prestigeStarBoxV57, width:size, height:size, fontSize:size}}>
            <span style={prestigeStarEmptyV57}>★</span>
            <span style={{...prestigeStarFillV57, width:`${fill * 100}%`}}>★</span>
          </span>
        );
      })}
    </span>
  );
}

function draftTeamRating(team) {
  const prestigeRaw = team?.draft_prestige ?? team?.school_prestige ?? team?.prestige_grade;
  const ovrRaw = team?.draft_overall ?? team?.overall_rating ?? team?.ovr;
  const offRaw = team?.draft_offense ?? team?.offense_rating ?? team?.off;
  const defRaw = team?.draft_defense ?? team?.defense_rating ?? team?.def;
  const pipelineRaw = team?.pipeline_grade ?? team?.draft_pipeline_grade ?? team?.pipeline_rating;
  const nilStartRaw = getStartingNil(team);
  const nilBudgetRaw = getOverallNilBudget(team);

  const hasAny = [prestigeRaw, ovrRaw, offRaw, defRaw, pipelineRaw, nilStartRaw, nilBudgetRaw].some((value)=>value !== "" && value !== null && value !== undefined);
  if (!hasAny) return "—";

  const prestige = Math.max(0, Math.min(5, draftNumberValue(prestigeRaw, 0))) * 20;
  const ovr = draftNumberValue(ovrRaw, 0);
  const off = draftNumberValue(offRaw, 0);
  const def = draftNumberValue(defRaw, 0);
  const pipeline = Math.max(0, Math.min(100, draftNumberValue(pipelineRaw, 0)));
  const nilStart = draftNormalizeNil(nilStartRaw, 4065);
  const nilBudget = draftNormalizeNil(nilBudgetRaw, 12500);

  // v79 formula: roster strength must lead. NIL and pipeline are tiebreaker/supporting factors.
  const rating =
    (ovr * 0.45) +
    (off * 0.15) +
    (def * 0.15) +
    (prestige * 0.12) +
    (pipeline * 0.05) +
    (nilStart * 0.04) +
    (nilBudget * 0.04);

  return Number(rating.toFixed(1));
}
function draftConferencePowerScore(row) {
  if (!row || !row.ratedTeams) return "—";
  const prestigeRating = row.avgPrestige * 20;
  const pipeline = row.avgPipeline || 0;
  const nilStart = draftNormalizeNil(row.avgNilStart || 0, 4065);
  const nilBudget = draftNormalizeNil(row.avgNilBudget || 0, 12500);
  const score = (row.avgOvr * 0.45) + (row.avgOff * 0.15) + (row.avgDef * 0.15) + (prestigeRating * 0.12) + (pipeline * 0.05) + (nilStart * 0.04) + (nilBudget * 0.04);
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
  const pipe = team?.pipeline_grade ?? team?.draft_pipeline_grade ?? team?.pipeline_rating ?? "—";
  const nilStart = getStartingNil(team);
  const nilBudget = getOverallNilBudget(team);
  return `Prestige ${draftPrestigeStars(team)} | OVR ${ovr} | OFF ${off} | DEF ${def} | PIPE ${pipe} | NIL ${formatNilBudget(nilStart)}/${formatNilBudget(nilBudget)}`;
}

function DraftRoom({ teams = [], users = [], picks = [], settings = {}, conferenceAssets = [], startClock, pauseClock, resumeClock, announcePick, revealPick, undoPick }) {
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

  useEffect(() => {
    const nextCurrentPick = Number(settings?.current_pick || 1);
    setManualPickNumber(nextCurrentPick);
    setTimerMinutes(settings?.timer_minutes || 10);
  }, [settings?.current_pick, settings?.timer_minutes]);

  const eligibleTeamNames = new Set([
    "Army Black Knights","Charlotte 49ers","East Carolina Pirates","Florida Atlantic Owls","Memphis Tigers","Navy Midshipmen","North Texas Mean Green","Rice Owls","South Florida Bulls","USF Bulls","Connecticut","UCONN","UConn","Connecticut Huskies","UCONN Huskies","UConn Huskies","Temple Owls","Tulane Green Wave","Tulsa Golden Hurricane","UAB Blazers","UTSA Roadrunners",
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
  const currentPickNumber = Number(settings?.current_pick || manualPickNumber || 1);
  const currentPick =
    sortedPicks.find((pick) => Number(pick.pick_number) === currentPickNumber) ||
    sortedPicks.find((pick) => Number(pick.pick_number) === Number(manualPickNumber || 1)) ||
    sortedPicks.find((pick) => !pick.team_id || pick.status === "pick_is_in") ||
    sortedPicks[0] ||
    { pick_number: currentPickNumber || 1, discord_username: "User TBD", status: "pending" };

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
    .filter((team) => eligibleTeamNames.has(team.name) || (/uconn|connecticut/i.test(String(team.name || "")) && cleanConference(team.conference) === "American"))
    .filter((team) => isDraftAvailable(team))
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
    if (key === "name") return String(team?.name || "");
    if (key === "boardScore") {
      const score = draftTeamRating(team);
      return score === "—" ? -1 : Number(score);
    }
    if (key === "overall") return draftNumberValue(team?.draft_overall ?? team?.overall_rating ?? team?.ovr, -1);
    if (key === "offense") return draftNumberValue(team?.draft_offense ?? team?.offense_rating ?? team?.off, -1);
    if (key === "defense") return draftNumberValue(team?.draft_defense ?? team?.defense_rating ?? team?.def, -1);
    if (key === "prestige") return draftNumberValue(team?.draft_prestige ?? team?.school_prestige ?? team?.prestige_grade, -1);
    if (key === "pipeline") return draftNumberValue(team?.pipeline_grade ?? team?.draft_pipeline_grade ?? team?.pipeline_rating, -1);
    if (key === "nilStart") return draftNumberValue(getStartingNil(team), -1);
    if (key === "nilBudget") return draftNumberValue(getOverallNilBudget(team), -1);
    return String(team?.name || "");
  }

  function sortConferenceTeams(list) {
    return [...list].sort((a,b)=>{
      if (conferenceTeamSort === "name") {
        return String(a?.name || "").localeCompare(String(b?.name || ""));
      }

      const av = draftSortValue(a, conferenceTeamSort);
      const bv = draftSortValue(b, conferenceTeamSort);

      return Number(bv) - Number(av)
        || String(a?.name || "").localeCompare(String(b?.name || ""));
    });
  }

  const sortedAvailableTeams = sortConferenceTeams(availableTeams);

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
      const confTeams = teams.filter((team)=>(eligibleTeamNames.has(team.name) || (/uconn|connecticut/i.test(String(team.name || "")) && cleanConference(team.conference) === "American")) && isDraftAvailable(team) && cleanConference(team.conference) === conf);
      const ratedTeams = confTeams.filter((team)=>draftTeamRating(team) !== "—");
      const avgOvr = draftRatingAverage(ratedTeams.map((team)=>team.draft_overall ?? team.overall_rating ?? team.ovr)) ?? 0;
      const avgOff = draftRatingAverage(ratedTeams.map((team)=>team.draft_offense ?? team.offense_rating ?? team.off)) ?? 0;
      const avgDef = draftRatingAverage(ratedTeams.map((team)=>team.draft_defense ?? team.defense_rating ?? team.def)) ?? 0;
      const avgPrestige = draftRatingAverage(ratedTeams.map((team)=>team.draft_prestige ?? team.school_prestige ?? team.prestige_grade)) ?? 0;
      const avgPipeline = draftRatingAverage(ratedTeams.map((team)=>team.pipeline_grade ?? team.draft_pipeline_grade ?? team.pipeline_rating)) ?? 0;
      const avgNilStart = draftRatingAverage(ratedTeams.map((team)=>team.starting_nil ?? team.draft_starting_nil ?? team.available_nil)) ?? 0;
      const avgNilBudget = draftRatingAverage(ratedTeams.map((team)=>team.overall_nil_budget ?? team.draft_nil_budget ?? team.nil_budget)) ?? 0;
      const draftedTeams = localPicks
        .map((pick)=>{
          const team = teams.find((t)=>String(t.id)===String(pick.team_id)) || pick.teams;
          if (!team || cleanConference(team.conference) !== conf) return null;
          return {
            team,
            userName: pick.discord_username || pick.discord_users?.discord_username || "User TBD",
            pickNumber: pick.pick_number,
          };
        })
        .filter(Boolean)
        .sort((a,b)=>Number(a.pickNumber)-Number(b.pickNumber));
      const count = conferenceCounts[conf] || 0;
      const locked = lockedConferences.has(conf);
      const firstTwoClosed = conferencesAtSix.slice(0, 2).includes(conf);
      const closeAt = firstTwoClosed || conferencesAtSix.length < 2 ? 6 : 5;
      const remainingToClose = Math.max(0, closeAt - count);
      const row = { conference: conf, totalTeams: confTeams.length, ratedTeams: ratedTeams.length, avgOvr, avgOff, avgDef, avgPrestige, avgPipeline, avgNilStart, avgNilBudget, draftedTeams, count, locked, closeAt, remainingToClose };
      return { ...row, powerScore: draftConferencePowerScore(row) };
    })
    .sort((a,b)=>(Number(b.powerScore) || 0) - (Number(a.powerScore) || 0) || a.conference.localeCompare(b.conference));

  const draftTickerEntries = sortedPicks.map((pick) => {
    const team = teams.find((t)=>String(t.id)===String(pick.team_id)) || pick.teams;
    const userName = pick.discord_username || pick.discord_users?.discord_username || "User TBD";
    const isClock = Number(pick.pick_number) === Number(displayPick?.pick_number);
    const statusText = team
      ? `#${pick.pick_number} ${userName} selects ${getTeamAbbreviation(team)}`
      : isClock
        ? `ON THE CLOCK: #${pick.pick_number} ${userName}`
        : `#${pick.pick_number} ${userName} on deck`;
    return { ...pick, team, userName, isClock, statusText };
  });

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
          {([...draftTickerEntries, ...draftTickerEntries].map((entry, index)=>(
            <span key={`${entry.pick_number}-${index}`} style={entry.isClock ? draftTickerClockV49 : null}>{entry.statusText}</span>
          )))}
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
              <div style={draftConferenceBadgeV70} title={cleanConference(team.conference)}>
                <ConferenceLogoMark conference={team.conference} conferenceAssets={conferenceAssets} size={22}/>
                <span>{cleanConference(team.conference)}</span>
              </div>
              <div style={draftBestLogoV43}><TeamLogoMark team={team} size={52}/></div>
              <strong style={draftBestTeamNameV43}>{team.name}</strong>
              <div style={draftBestStarsV43}><PrestigeStars team={team} size={16}/></div>
              <div style={draftBestRatingsV43}>
                <span>OVR <b>{team.draft_overall ?? team.overall_rating ?? team.ovr ?? "—"}</b></span>
                <span>OFF <b>{team.draft_offense ?? team.offense_rating ?? team.off ?? "—"}</b></span>
                <span>DEF <b>{team.draft_defense ?? team.defense_rating ?? team.def ?? "—"}</b></span>
              </div>
              <div style={draftNilPipelineMiniV77}>
                <span>PIPE <b>{getPipelineGrade(team)}</b></span>
                <span>NIL START <b>{formatNilBudget(getStartingNil(team))}</b></span>
                <span>NIL TOTAL <b>{formatNilBudget(getOverallNilBudget(team))}</b></span>
              </div>
              <div style={draftBestScoreBoxV43}><span>Board Score</span><b>{draftTeamRating(team)}</b></div>
            </button>
          ))}
        </div>
      </section>



      <section style={warRoomModePanelV46}>
        <div style={draftBestHeaderV40}>
          <span>WAR ROOM MODE</span>
          <b>Draft Analytics</b>
        </div>
        <div style={warRoomModeGridV46}>
          <WarRoomList title="Best Offense Available" rows={bestOffenseAvailable} metric={(team)=>team.draft_offense ?? team.offense_rating ?? team.off ?? "—"} setSelectedTeamId={setSelectedTeamId}/>
          <WarRoomList title="Best Defense Available" rows={bestDefenseAvailable} metric={(team)=>team.draft_defense ?? team.defense_rating ?? team.def ?? "—"} setSelectedTeamId={setSelectedTeamId}/>
          <WarRoomList title="Highest Prestige Available" rows={highestPrestigeAvailable} metric={(team)=><PrestigeStars team={team} size={14}/>}  setSelectedTeamId={setSelectedTeamId}/>
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
                <span style={conferencePowerNameV54}><ConferenceLogoMark conference={row.conference} conferenceAssets={conferenceAssets} size={30}/><strong>{row.conference}</strong></span>
                <b>{row.powerScore}</b>
              </div>
              <div style={conferenceCapStatusV58}>
                <span style={row.locked ? conferenceLockedPillV58 : conferenceOpenPillV58}>{row.locked ? "CLOSED" : "OPEN"}</span>
                <b>{row.count} selected</b>
                <small>{row.locked ? "Conference cap reached" : `${row.remainingToClose} more until close at ${row.closeAt}`}</small>
              </div>
              <div style={draftConferencePowerStatsV42}>
                <span>OVR <b>{row.ratedTeams ? row.avgOvr : "—"}</b></span>
                <span>OFF <b>{row.ratedTeams ? row.avgOff : "—"}</b></span>
                <span>DEF <b>{row.ratedTeams ? row.avgDef : "—"}</b></span>
                <span>PRESTIGE <b>{row.ratedTeams ? row.avgPrestige : "—"}</b></span>
              </div>
              <small>{row.ratedTeams}/{row.totalTeams} teams rated</small>
              <div style={draftConferencePicksV49}>
                {row.draftedTeams.length ? row.draftedTeams.map((item)=>(
                  <div key={`${row.conference}-${item.pickNumber}`} style={draftConferencePickRowV49}>
                    <span>#{item.pickNumber}</span>
                    <TeamLogoMark team={item.team} size={22}/>
                    <b>{item.team.name}</b>
                    <small>{item.userName}</small>
                  </div>
                )) : <small>No teams drafted from this conference yet.</small>}
              </div>
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
            <span>Sort available teams by</span>
            <select style={draftConferenceSortSelectV48} value={conferenceTeamSort} onChange={(e)=>setConferenceTeamSort(e.target.value)}>
              <option value="name">Team Name A-Z</option>
              <option value="boardScore">Board Score</option>
              <option value="overall">Overall Rating</option>
              <option value="offense">Offensive Rating</option>
              <option value="defense">Defensive Rating</option>
              <option value="prestige">Prestige</option>
              <option value="pipeline">Pipeline</option>
              <option value="nilStart">Starting NIL</option>
              <option value="nilBudget">Overall NIL</option>
            </select>
          </div>

          <div style={draftSortStatusV80}>
            Showing {sortedAvailableTeams.length} teams • Sorted by {conferenceTeamSort === "name" ? "Team Name A-Z" : conferenceTeamSort === "boardScore" ? "Board Score" : conferenceTeamSort === "overall" ? "Overall Rating" : conferenceTeamSort === "offense" ? "Offensive Rating" : conferenceTeamSort === "defense" ? "Defensive Rating" : conferenceTeamSort === "prestige" ? "Prestige" : conferenceTeamSort === "pipeline" ? "Pipeline" : conferenceTeamSort === "nilStart" ? "Starting NIL" : "Overall NIL"}
          </div>
          <div style={draftAvailableBestGridV79}>
            {sortedAvailableTeams.map((team, index)=>(
              <button key={team.id} style={{...draftBestTileV43, minHeight:188, background:`linear-gradient(145deg, ${getTeamPrimary(team)}cc, rgba(2,6,23,.96))`, borderColor:getTeamSecondary(team)}} onClick={()=>setSelectedTeamId(team.id)}>
                <div style={draftBestRankV43}>#{index+1}</div>
                <div style={draftConferenceBadgeV70} title={cleanConference(team.conference)}>
                  <ConferenceLogoMark conference={team.conference} conferenceAssets={conferenceAssets} size={22}/>
                  <span>{cleanConference(team.conference)}</span>
                </div>
                <div style={draftBestLogoV43}><TeamLogoMark team={team} size={52}/></div>
                <strong style={draftBestTeamNameV43}>{team.name}</strong>
                <div style={draftBestStarsV43}><PrestigeStars team={team} size={15}/></div>
                <div style={draftBestRatingsV43}>
                  <span>OVR <b>{team.draft_overall ?? team.overall_rating ?? team.ovr ?? "—"}</b></span>
                  <span>OFF <b>{team.draft_offense ?? team.offense_rating ?? team.off ?? "—"}</b></span>
                  <span>DEF <b>{team.draft_defense ?? team.defense_rating ?? team.def ?? "—"}</b></span>
                </div>
                <div style={draftNilPipelineMiniV77}>
                  <span>PIPE <b>{getPipelineGrade(team)}</b></span>
                  <span>NIL START <b>{formatNilBudget(getStartingNil(team))}</b></span>
                  <span>NIL TOTAL <b>{formatNilBudget(getOverallNilBudget(team))}</b></span>
                </div>
                <div style={draftBestScoreBoxV43}><span>Board Score</span><b>{draftTeamRating(team)}</b></div>
              </button>
            ))}
          </div>
        </aside>
      </section>
</section>
  );
}


function WarRoomList({ title, rows = [], metric, setSelectedTeamId }) {
  const topTeam = rows[0];
  const primary = getTeamPrimary(topTeam);
  const secondary = getTeamSecondary(topTeam);

  return (
    <div style={{...warRoomListV49, background: topTeam ? `linear-gradient(145deg, ${primary}99, rgba(15,23,42,.96))` : warRoomListV49.background, borderColor: topTeam ? `${secondary}88` : warRoomListV49.border}}>
      <h3>{title}</h3>
      <div style={warRoomTopFiveV49}>
        {rows.length ? rows.slice(0,5).map((team,index)=>(
          <button key={team.id || team.name} style={warRoomRowV49} onClick={()=>setSelectedTeamId(String(team.id))}>
            <span>#{index+1}</span>
            <TeamLogoMark team={team} size={28}/>
            <b>{team.name}</b>
            <strong>{metric(team)}</strong>
          </button>
        )) : <p style={mutedText}>Add ratings in Team Assets.</p>}
      </div>
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

function UserManagerV2({users=[],assignments=[],teams=[],linkedDiscordUser,addDiscordUser,renameDiscordUser,setDiscordUserActive,setDiscordCommissionerStatus}) {
  const [newName,setNewName]=useState("");
  const [drafts,setDrafts]=useState({});
  const activeTeamFor=(userId)=>{
    const assignment=assignments.find((row)=>String(row.discord_user_id)===String(userId)&&row.status==="Active");
    return teams.find((team)=>String(team.id)===String(assignment?.team_id));
  };
  return <main className="cfb-v2-page" style={v2Page}>
    <div style={v2PageHero}><div><span style={v2Eyebrow}>COMMISSIONER TOOL</span><h1 style={v2PageTitle}>Discord Users</h1><p style={v2PageSub}>Add users, correct usernames, assign commissioner access, and deactivate former members without deleting league history.</p></div></div>
    <section className="elite-commissioner-access"><div><span>COMMISSIONER ACCESS</span><h2>Delegate League Control</h2><p>Commissioners can manage protected Elite Books controls, odds seeds, matchup locks and futures. Only an already linked commissioner can grant or revoke this status, and the final commissioner cannot be removed.</p></div><strong>{users.filter((user)=>user.is_commissioner).length} Commissioner{users.filter((user)=>user.is_commissioner).length===1?"":"s"}</strong></section>
    {!linkedDiscordUser?.is_commissioner&&<div style={v2Notice}>Sign in with a Discord account that already has commissioner status before changing commissioner access.</div>}
    <section style={v2Panel}><div style={v2PanelHeader}><div><span style={v2Eyebrow}>NEW MEMBER</span><h2>Add Discord User</h2></div></div><div style={v2InlineForm}><input style={v2Input} value={newName} onChange={(e)=>setNewName(e.target.value)} placeholder="Discord username" onKeyDown={async(e)=>{if(e.key==="Enter"&&await addDiscordUser(newName))setNewName("");}}/><button style={v2PrimaryButton} onClick={async()=>{if(await addDiscordUser(newName))setNewName("");}}>Add User</button></div></section>
    <section style={v2Panel}><div style={v2PanelHeader}><div><span style={v2Eyebrow}>MEMBER DIRECTORY</span><h2>{users.length} Discord Users</h2></div></div><div className="cfb-v2-user-grid" style={v2UserGrid}>{users.map((user)=>{
      const team=activeTeamFor(user.id); const draft=drafts[user.id]??user.discord_username;
      return <article key={user.id} style={{...v2UserCard,borderColor:user.is_commissioner?"rgba(167,139,250,.7)":`${getTeamSecondary(team)}44`}}><div style={v2UserIdentity}><TeamLogoMark team={team} size={48} plate/><div><b>{user.discord_username}</b><span>{team?.name||"No active team"}</span></div><div className="elite-user-statuses"><small style={user.is_active===false?v2InactiveBadge:v2ActiveBadge}>{user.is_active===false?"INACTIVE":"ACTIVE"}</small>{user.is_commissioner&&<small className="elite-commissioner-badge">COMMISSIONER</small>}</div></div><div style={v2InlineForm}><input style={v2Input} value={draft} onChange={(e)=>setDrafts({...drafts,[user.id]:e.target.value})}/><button style={v2GhostButton} onClick={()=>renameDiscordUser(user.id,draft)}>Save Name</button><button style={user.is_active===false?v2PrimaryButton:v2DangerSoft} onClick={()=>setDiscordUserActive(user.id,user.is_active===false)}>{user.is_active===false?"Reactivate":"Deactivate"}</button></div><button className={`elite-commissioner-toggle ${user.is_commissioner?"revoke":"grant"}`} disabled={!linkedDiscordUser?.is_commissioner} onClick={()=>setDiscordCommissionerStatus(user.id,!user.is_commissioner)}>{user.is_commissioner?"Revoke Commissioner Status":"Grant Commissioner Status"}</button></article>;
    })}</div></section>
  </main>;
}

function ScheduleManagerV2({rows=[],newMatchup,setNewMatchup,teams=[],users=[],assignments=[],currentYear,currentWeek,addMatchup,deleteRow,matchupImportText,setMatchupImportText,importWeeklyMatchups,loadData,setError}) {
  const [drafts,setDrafts]=useState({});
  const [weekFilter,setWeekFilter]=useState(currentWeek);
  const [armedDelete,setArmedDelete]=useState(null);
  const activeUsers=users.filter((user)=>user.is_active!==false);
  const seasonRows=rows.filter((row)=>String(row.season_year)===String(currentYear)&&(!weekFilter||weekFilter==="all"||String(row.week)===String(weekFilter))).sort((a,b)=>weekIndex(a.week)-weekIndex(b.week));
  const draftFor=(row)=>({...row,...(drafts[row.id]||{})});
  async function saveScheduleDetails(row) {
    const draft=draftFor(row);
    const payload={
      team_1_user_id:draft.team_1_user_id||null,
      team_2_user_id:draft.team_2_user_id||null,
      scheduled_at:draft.scheduled_at||null,
      stream_url:String(draft.stream_url||"").trim()||null,
      vod_url:String(draft.vod_url||"").trim()||null,
      notes:String(draft.notes||"").trim()||null,
      status:draft.status||"upcoming",
    };
    const {error}=await supabase.from("weekly_matchups").update(payload).eq("id",row.id);
    if(error){setError(`Schedule save failed: ${error.message}. Run the v2 Supabase migration if the new fields are missing.`);return;}
    setError(`Saved ${row.week} matchup details.`); await loadData();
  }
  return <main className="cfb-v2-page" style={v2Page}>
    <div style={v2PageHero}><div><span style={v2Eyebrow}>COMMISSIONER TOOL</span><h1 style={v2PageTitle}>Schedule Manager</h1><p style={v2PageSub}>Schedule games, attach streams and VODs, and import multiple weeks at once.</p></div><select style={v2Input} value={weekFilter} onChange={(e)=>setWeekFilter(e.target.value)}><option value="all">All Weeks</option>{WEEKS.map((week)=><option key={week}>{week}</option>)}</select></div>
    <section style={v2Panel}><div style={v2PanelHeader}><div><span style={v2Eyebrow}>ADD ONE GAME</span><h2>New Matchup</h2></div><button style={v2PrimaryButton} onClick={addMatchup}>Add Matchup</button></div><div className="cfb-v2-form-grid" style={v2FormGrid}><select style={v2Input} value={newMatchup.season_year} onChange={(e)=>setNewMatchup({...newMatchup,season_year:e.target.value})}>{YEARS.map((year)=><option key={year}>{year}</option>)}</select><select style={v2Input} value={newMatchup.week} onChange={(e)=>setNewMatchup({...newMatchup,week:e.target.value})}>{WEEKS.map((week)=><option key={week}>{week}</option>)}</select><select style={v2Input} value={newMatchup.team_1_id} onChange={(e)=>setNewMatchup({...newMatchup,team_1_id:e.target.value})}><option value="">Away Team</option>{teams.map((team)=><option key={team.id} value={team.id}>{team.name}</option>)}</select><select style={v2Input} value={newMatchup.team_2_id} onChange={(e)=>setNewMatchup({...newMatchup,team_2_id:e.target.value})}><option value="">Home Team</option>{teams.map((team)=><option key={team.id} value={team.id}>{team.name}</option>)}</select><select style={v2Input} value={newMatchup.team_1_user_id} onChange={(e)=>setNewMatchup({...newMatchup,team_1_user_id:e.target.value})}><option value="">Auto-detect Away User</option>{activeUsers.map((user)=><option key={user.id} value={user.id}>{user.discord_username}</option>)}</select><select style={v2Input} value={newMatchup.team_2_user_id} onChange={(e)=>setNewMatchup({...newMatchup,team_2_user_id:e.target.value})}><option value="">Auto-detect Home User</option>{activeUsers.map((user)=><option key={user.id} value={user.id}>{user.discord_username}</option>)}</select></div></section>
    <section style={v2Panel}><div style={v2PanelHeader}><div><span style={v2Eyebrow}>BULK IMPORT</span><h2>Paste Multiple Weeks</h2></div><button style={v2PrimaryButton} onClick={importWeeklyMatchups}>Import Schedule</button></div><p style={v2PageSub}>Use week headings followed by one matchup per line. Existing games are skipped automatically.</p><textarea style={v2Textarea} value={matchupImportText} onChange={(e)=>setMatchupImportText(e.target.value)} placeholder={"Week 3\nRice Owls vs UAB Blazers\nGeorgia Southern Eagles vs Sacramento State Hornets\n\nWeek 4\nDelaware Blue Hens vs Arkansas State Red Wolves"}/></section>
    <section style={v2Panel}><div style={v2PanelHeader}><div><span style={v2Eyebrow}>SCHEDULE DETAILS</span><h2>{seasonRows.length} Matchups</h2></div></div><div style={v2ScheduleList}>{seasonRows.length?seasonRows.map((row)=>{
      const draft=draftFor(row); const team1=row.team_1||teams.find((team)=>String(team.id)===String(row.team_1_id)); const team2=row.team_2||teams.find((team)=>String(team.id)===String(row.team_2_id));
      return <article key={row.id} style={v2ScheduleEditor}><div style={v2ScheduleEditorHead}><span>{row.week}</span><div><TeamLogoMark team={team1} size={34}/><b>{team1?.name}</b><em>vs</em><TeamLogoMark team={team2} size={34}/><b>{team2?.name}</b></div></div><div className="cfb-v2-form-grid" style={v2FormGrid}><select style={v2Input} value={draft.team_1_user_id||""} onChange={(e)=>setDrafts({...drafts,[row.id]:{...(drafts[row.id]||{}),team_1_user_id:e.target.value}})}><option value="">Auto Away User</option>{activeUsers.map((user)=><option key={user.id} value={user.id}>{user.discord_username}</option>)}</select><select style={v2Input} value={draft.team_2_user_id||""} onChange={(e)=>setDrafts({...drafts,[row.id]:{...(drafts[row.id]||{}),team_2_user_id:e.target.value}})}><option value="">Auto Home User</option>{activeUsers.map((user)=><option key={user.id} value={user.id}>{user.discord_username}</option>)}</select><input type="datetime-local" style={v2Input} value={isoToLocalDateTimeInput(draft.scheduled_at)} onChange={(e)=>setDrafts({...drafts,[row.id]:{...(drafts[row.id]||{}),scheduled_at:localDateTimeInputToIso(e.target.value)}})}/><select style={v2Input} value={draft.status||"upcoming"} onChange={(e)=>setDrafts({...drafts,[row.id]:{...(drafts[row.id]||{}),status:e.target.value}})}><option value="upcoming">Upcoming</option><option value="scheduled">Scheduled</option><option value="live">Live</option><option value="final">Final</option><option value="postponed">Postponed</option></select><input style={v2Input} value={draft.stream_url||""} onChange={(e)=>setDrafts({...drafts,[row.id]:{...(drafts[row.id]||{}),stream_url:e.target.value}})} placeholder="Live stream URL"/><input style={v2Input} value={draft.vod_url||""} onChange={(e)=>setDrafts({...drafts,[row.id]:{...(drafts[row.id]||{}),vod_url:e.target.value}})} placeholder="VOD URL"/><input style={v2Input} value={draft.notes||""} onChange={(e)=>setDrafts({...drafts,[row.id]:{...(drafts[row.id]||{}),notes:e.target.value}})} placeholder="Game notes"/></div><div style={v2InlineActions}><button style={v2PrimaryButton} onClick={()=>saveScheduleDetails(row)}>Save Details</button><button style={armedDelete===row.id?v2DangerButton:v2DangerSoft} onClick={()=>{if(armedDelete===row.id){deleteRow("weekly_matchups",row.id);setArmedDelete(null);}else{setArmedDelete(row.id);window.setTimeout(()=>setArmedDelete(null),4000);}}}>{armedDelete===row.id?"Confirm Delete":"Delete"}</button></div></article>;
    }):<div style={v2Empty}>No matchups found for this filter.</div>}</div></section>
  </main>;
}

function CommissionerCenterV2({currentYear,currentWeek,advanceAt,setAdvanceAt,setActiveTab,saveLeagueSettings,saveCurrentRankingSnapshot,loadData,teams=[],users=[],assignments=[],results=[],weeklyMatchups=[],awards=[],allAmericans=[],heismans=[],nationalChampions=[],recruiting=[]}) {
  const seasonResults=results.filter((row)=>String(row.season_year)===String(currentYear));
  const seasonSchedule=weeklyMatchups.filter((row)=>String(row.season_year)===String(currentYear));
  const duplicateUsers=users.filter((user,index)=>users.findIndex((candidate)=>String(candidate.discord_username).toLowerCase()===String(user.discord_username).toLowerCase())!==index);
  const active=assignments.filter((row)=>row.status==="Active");
  const duplicateTeams=active.filter((row,index)=>active.findIndex((candidate)=>String(candidate.team_id)===String(row.team_id))!==index);
  const missingAssets=teams.filter((team)=>!team.logo_url||!team.primary_color||!team.secondary_color);
  const unresolved=seasonSchedule.filter((row)=>!row.team_1_user_id&&!active.some((assignment)=>String(assignment.team_id)===String(row.team_1_id))||!row.team_2_user_id&&!active.some((assignment)=>String(assignment.team_id)===String(row.team_2_id)));
  const tools=[["weeklyMatchups","Schedule Manager","Games, streams, VODs, and bulk imports"],["userManager","Discord Users","Add, rename, activate, or deactivate users"],["assignments","Team Assignments","Manage current and former team ownership"],["leagueDataCenter","League Data Center","Enter results, recruiting, and season statistics"],["resultsManager","Results Manager","Correct or remove recorded game results"],["logoManager","Team Assets","Team logos, colors, ratings, and conferences"],["allAmericans","Recognition","All-Americans, awards, Heismans, and champions"]];
  return <main className="cfb-v2-page" style={v2Page}>
    <div style={v2PageHero}><div><span style={v2Eyebrow}>PRIVATE ADMIN AREA</span><h1 style={v2PageTitle}>Commissioner Center</h1><p style={v2PageSub}>League operations, data health, schedule control, and season management.</p></div><button style={v2GhostButton} onClick={loadData}>Refresh All Data</button></div>
    <section className="cfb-v2-admin-grid" style={v2AdminGrid}><div style={v2Panel}><div style={v2PanelHeader}><div><span style={v2Eyebrow}>LEAGUE CLOCK</span><h2>{currentYear} • {currentWeek}</h2></div></div><label style={v2FieldLabel}>Next advancement<input type="datetime-local" style={v2Input} value={isoToLocalDateTimeInput(advanceAt)} onChange={(e)=>setAdvanceAt(localDateTimeInputToIso(e.target.value))}/></label><div style={v2InlineActions}><button style={v2PrimaryButton} onClick={saveLeagueSettings}>Save League Settings</button><button style={v2GhostButton} onClick={saveCurrentRankingSnapshot}>Save Ranking Snapshot</button></div></div><div style={v2Panel}><div style={v2PanelHeader}><div><span style={v2Eyebrow}>DATA HEALTH</span><h2>{duplicateUsers.length+duplicateTeams.length+missingAssets.length+unresolved.length?"Attention Needed":"All Clear"}</h2></div></div><div style={v2HealthList}><div><b>{duplicateUsers.length}</b><span>Duplicate usernames</span></div><div><b>{duplicateTeams.length}</b><span>Duplicate active teams</span></div><div><b>{missingAssets.length}</b><span>Teams missing branding</span></div><div><b>{unresolved.length}</b><span>Matchups missing users</span></div><div><b>{seasonResults.length}</b><span>Recorded season results</span></div></div></div></section>
    <section style={v2Panel}><div style={v2PanelHeader}><div><span style={v2Eyebrow}>ADMIN TOOLS</span><h2>League Management</h2></div></div><div className="cfb-v2-tool-grid" style={v2ToolGrid}>{tools.map(([key,title,desc])=><button key={key} style={v2ToolCard} onClick={()=>setActiveTab(key)}><b>{title}</b><span>{desc}</span><em>Open →</em></button>)}</div></section>
    <BackupExportPanel teams={teams} users={users} assignments={assignments} results={results} awards={awards} allAmericans={allAmericans} heismans={heismans} nationalChampions={nationalChampions} recruiting={recruiting}/>
  </main>;
}


function AllTeamsRatings({ teams = [] }) {
  const [filters, setFilters] = useState({ search:"", conferences:[], minOverall:"", minOffense:"", minDefense:"" });
  const [sortConfig, setSortConfig] = useState({ key:"name", direction:"asc" });

  const conferences = Array.from(new Set(teams.map((team)=>cleanConference(team.conference)).filter(Boolean))).sort();
  const allSelected = !filters.conferences.length;

  function toggleConference(conf) {
    setFilters((prev)=>{
      const current = new Set(prev.conferences || []);
      if (current.has(conf)) current.delete(conf);
      else current.add(conf);
      return { ...prev, conferences:Array.from(current).sort() };
    });
  }

  const rows = [...teams]
    .filter((team)=>{
      const conf = cleanConference(team.conference);
      const nameMatch = !filters.search || `${team.name} ${conf}`.toLowerCase().includes(filters.search.toLowerCase());
      const confMatch = allSelected || filters.conferences.includes(conf);
      const overall = draftNumberValue(team.draft_overall ?? team.overall_rating ?? team.ovr, 0);
      const offense = draftNumberValue(team.draft_offense ?? team.offense_rating ?? team.off, 0);
      const defense = draftNumberValue(team.draft_defense ?? team.defense_rating ?? team.def, 0);
      const overallMatch = !filters.minOverall || overall >= Number(filters.minOverall);
      const offenseMatch = !filters.minOffense || offense >= Number(filters.minOffense);
      const defenseMatch = !filters.minDefense || defense >= Number(filters.minDefense);
      return nameMatch && confMatch && overallMatch && offenseMatch && defenseMatch;
    })
    .sort((a,b)=>{
      const key = sortConfig.key;
      let av;
      let bv;
      if (key === "name") { av = a.name; bv = b.name; }
      else if (key === "conference") { av = cleanConference(a.conference); bv = cleanConference(b.conference); }
      else if (key === "prestige") { av = draftNumberValue(a.draft_prestige ?? a.school_prestige ?? a.prestige_grade, -1); bv = draftNumberValue(b.draft_prestige ?? b.school_prestige ?? b.prestige_grade, -1); }
      else if (key === "overall") { av = draftNumberValue(a.draft_overall ?? a.overall_rating ?? a.ovr, -1); bv = draftNumberValue(b.draft_overall ?? b.overall_rating ?? b.ovr, -1); }
      else if (key === "offense") { av = draftNumberValue(a.draft_offense ?? a.offense_rating ?? a.off, -1); bv = draftNumberValue(b.draft_offense ?? b.offense_rating ?? b.off, -1); }
      else if (key === "defense") { av = draftNumberValue(a.draft_defense ?? a.defense_rating ?? a.def, -1); bv = draftNumberValue(b.draft_defense ?? b.defense_rating ?? b.def, -1); }
      else { av = draftTeamRating(a) === "—" ? -1 : Number(draftTeamRating(a)); bv = draftTeamRating(b) === "—" ? -1 : Number(draftTeamRating(b)); }

      let cmp;
      if (typeof av === "string" || typeof bv === "string") cmp = String(av || "").localeCompare(String(bv || ""));
      else cmp = Number(av) - Number(bv);
      return sortConfig.direction === "asc" ? cmp : -cmp;
    });

  function toggleSort(key) {
    setSortConfig((prev)=>({ key, direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc" }));
  }

  const columns = [
    ["name", "Team"],
    ["conference", "Conference"],
    ["prestige", "Prestige"],
    ["overall", "Overall"],
    ["offense", "Offense"],
    ["defense", "Defense"],
    ["boardScore", "Board Score"],
  ];

  return (
    <section style={broadcastCard}>
      <div style={sectionTop}>
        <div>
          <h2 style={sectionTitle}>All Teams Ratings</h2>
          <p style={mutedText}>Every user and non-user team listed alphabetically by default. Sort and filter ratings from one place.</p>
        </div>
      </div>

      <div style={allTeamsFilterGridV58}>
        <input style={input} value={filters.search} onChange={(e)=>setFilters((prev)=>({...prev, search:e.target.value}))} placeholder="Search team or conference..."/>
        <input style={input} value={filters.minOverall} onChange={(e)=>setFilters((prev)=>({...prev, minOverall:e.target.value}))} placeholder="Min Overall"/>
        <input style={input} value={filters.minOffense} onChange={(e)=>setFilters((prev)=>({...prev, minOffense:e.target.value}))} placeholder="Min Offense"/>
        <input style={input} value={filters.minDefense} onChange={(e)=>setFilters((prev)=>({...prev, minDefense:e.target.value}))} placeholder="Min Defense"/>
      </div>

      <div style={conferenceMultiFilterV60}>
        <button type="button" style={allSelected ? conferenceFilterPillActiveV60 : conferenceFilterPillV60} onClick={()=>setFilters((prev)=>({...prev, conferences:[]}))}>All Conferences</button>
        {conferences.map((conf)=>(
          <button type="button" key={conf} style={filters.conferences.includes(conf) ? conferenceFilterPillActiveV60 : conferenceFilterPillV60} onClick={()=>toggleConference(conf)}>
            {conf}
          </button>
        ))}
      </div>

      <p style={mutedText}>{rows.length} teams shown{allSelected ? "" : ` • ${filters.conferences.join(", ")}`}</p>

      <div style={allTeamsTableWrapV58} className="cfb-table-scroll">
        <table style={allTeamsTableV58}>
          <thead>
            <tr>
              {columns.map(([key,label])=>(
                <th key={key}>
                  <button type="button" style={tableSortButtonV41} onClick={()=>toggleSort(key)}>
                    {label}{sortConfig.key === key ? (sortConfig.direction === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((team)=>(
              <tr key={team.id} style={{...allTeamsRowV58, background:`linear-gradient(90deg, ${getTeamPrimary(team)}88, rgba(15,23,42,.96))`, borderColor:getTeamSecondary(team)}}>
                <td>
                  <div style={allTeamsTeamCellV58}>
                    <TeamLogoMark team={team} size={44}/>
                    <b>{team.name}</b>
                  </div>
                </td>
                <td>{cleanConference(team.conference) || "—"}</td>
                <td><PrestigeStars team={team} size={15}/></td>
                <td>{team.draft_overall ?? team.overall_rating ?? team.ovr ?? "—"}</td>
                <td>{team.draft_offense ?? team.offense_rating ?? team.off ?? "—"}</td>
                <td>{team.draft_defense ?? team.defense_rating ?? team.def ?? "—"}</td>
                <td><b>{draftTeamRating(team)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LogoManager({ teams, updateRow, conferenceAssets = [], saveConferenceAsset }) {
  const [searchText, setSearchText] = useState("");
  const [assetDrafts, setAssetDrafts] = useState({});
  const [conferenceDrafts, setConferenceDrafts] = useState({});
  const filtered = teams.filter((team)=>team.name.toLowerCase().includes(searchText.toLowerCase()));
  const conferenceRows = CONFERENCE_ASSET_NAMES.map((name)=>conferenceAssets.find((row)=>cleanConference(row.conference_name) === cleanConference(name)) || { conference_name:name, logo_url:"" });

  function teamDraft(team) {
    const base = {
      logo_url: team.logo_url || "",
      primary_color: team.primary_color || "",
      secondary_color: team.secondary_color || "",
      abbreviation: team.abbreviation || "",
      draft_available: isDraftAvailable(team) ? "true" : "false",
      draft_prestige: team.draft_prestige || "",
      draft_overall: team.draft_overall || "",
      draft_offense: team.draft_offense || "",
      draft_defense: team.draft_defense || "",
      pipeline_grade: team.pipeline_grade || team.draft_pipeline_grade || team.pipeline_rating || "",
      starting_nil: team.starting_nil || team.draft_starting_nil || team.available_nil || "",
      overall_nil_budget: team.overall_nil_budget || team.draft_nil_budget || team.nil_budget || "",
    };
    return {
      ...base,
      ...(assetDrafts[team.id] || {}),
    };
  }

  function setTeamDraft(teamId, field, value) {
    const team = teams.find((item)=>String(item.id) === String(teamId));
    const base = team ? {
      logo_url: team.logo_url || "",
      primary_color: team.primary_color || "",
      secondary_color: team.secondary_color || "",
      abbreviation: team.abbreviation || "",
      draft_available: isDraftAvailable(team) ? "true" : "false",
      draft_prestige: team.draft_prestige || "",
      draft_overall: team.draft_overall || "",
      draft_offense: team.draft_offense || "",
      draft_defense: team.draft_defense || "",
      pipeline_grade: team.pipeline_grade || team.draft_pipeline_grade || team.pipeline_rating || "",
      starting_nil: team.starting_nil || team.draft_starting_nil || team.available_nil || "",
      overall_nil_budget: team.overall_nil_budget || team.draft_nil_budget || team.nil_budget || "",
    } : {};
    setAssetDrafts((prev)=>({
      ...prev,
      [teamId]: {
        ...base,
        ...(prev[teamId] || {}),
        [field]: value,
      },
    }));
  }

  async function saveTeamAsset(team) {
    const draft = teamDraft(team);
    const touched = assetDrafts[team.id] || {};
    const fields = ["logo_url","primary_color","secondary_color","abbreviation","draft_available","draft_prestige","draft_overall","draft_offense","draft_defense","pipeline_grade","starting_nil","overall_nil_budget"];
    for (const field of fields) {
      if (!(field in touched)) continue;
      const current = team[field] ?? "";
      const next = draft[field] ?? "";
      if (String(current) !== String(next)) {
        await updateRow("teams", team.id, field, next);
      }
    }
    setAssetDrafts((prev)=>{
      const next = { ...prev };
      delete next[team.id];
      return next;
    });
  }

  function confDraft(row) {
    return conferenceDrafts[row.conference_name] ?? row.logo_url ?? "";
  }

  function setConfDraft(conferenceName, value) {
    setConferenceDrafts((prev)=>({ ...prev, [conferenceName]: value }));
  }

  async function saveConfAsset(row) {
    await saveConferenceAsset(row.conference_name, "logo_url", confDraft(row));
    setConferenceDrafts((prev)=>{
      const next = { ...prev };
      delete next[row.conference_name];
      return next;
    });
  }

  return (
    <section style={broadcastCard}>
      <h2 style={sectionTitle}>Team Assets Manager</h2>
      <p style={mutedText}>Edit fields freely, then click Save Team Asset. This prevents the app from saving/reloading on every keystroke.</p>
      <SearchBox value={searchText} onChange={setSearchText}/>
      <div style={logoManagerGrid}>
        {filtered.map((team)=>{
          const draft = teamDraft(team);
          const previewTeam = { ...team, ...draft };
          const touched = assetDrafts[team.id] || {};
          const dirty = Object.keys(touched).some((field)=>String(team[field] ?? "") !== String(draft[field] ?? ""));
          return (
            <div key={team.id} style={logoManagerCard}>
              <div style={teamAssetLogoStageV54}>
                <div style={{...teamAssetLogoBackdropV54, background:`linear-gradient(135deg, ${getTeamPrimary(previewTeam)}88, rgba(15,23,42,.96))`, borderColor:getTeamSecondary(previewTeam)}}>
                  {draft.logo_url ? <img src={draft.logo_url} alt="" style={teamAssetLogoImgV54}/> : <span>No Logo</span>}
                </div>
                <b>{team.name}</b>
              </div>

              <input style={input} value={draft.logo_url} onChange={(e)=>setTeamDraft(team.id, "logo_url", e.target.value)} placeholder="Official Logo URL"/>
              <input style={input} value={draft.primary_color} onChange={(e)=>setTeamDraft(team.id, "primary_color", e.target.value)} placeholder="Primary Color #000000"/>
              <input style={input} value={draft.secondary_color} onChange={(e)=>setTeamDraft(team.id, "secondary_color", e.target.value)} placeholder="Secondary Color #ffffff"/>
              <input style={input} value={draft.abbreviation} onChange={(e)=>setTeamDraft(team.id, "abbreviation", e.target.value.toUpperCase())} placeholder="Abbreviation"/>
              <label style={assetFieldLabelV54}>Draft Availability</label>
              <select style={input} value={String(draft.draft_available ?? "true")} onChange={(e)=>setTeamDraft(team.id, "draft_available", e.target.value)}>
                <option value="true">Available for Draft</option>
                <option value="false">Banned / Unavailable</option>
              </select>

              <label style={assetFieldLabelV54}>Prestige
                <select style={input} value={draft.draft_prestige} onChange={(e)=>setTeamDraft(team.id, "draft_prestige", e.target.value)}>
                  {DRAFT_PRESTIGE_OPTIONS.map((value)=><option key={value} value={value}>{value ? `${value} Stars` : "Select Prestige"}</option>)}
                </select>
              </label>

              <input style={input} value={draft.draft_overall} onChange={(e)=>setTeamDraft(team.id, "draft_overall", e.target.value)} placeholder="Overall Rating"/>
              <input style={input} value={draft.draft_offense} onChange={(e)=>setTeamDraft(team.id, "draft_offense", e.target.value)} placeholder="Offense Rating"/>
              <input style={input} value={draft.draft_defense} onChange={(e)=>setTeamDraft(team.id, "draft_defense", e.target.value)} placeholder="Defense Rating"/>
              <input style={input} value={draft.pipeline_grade} onChange={(e)=>setTeamDraft(team.id, "pipeline_grade", e.target.value)} placeholder="Pipeline Grade 0-100"/>
              <input style={input} value={draft.starting_nil} onChange={(e)=>setTeamDraft(team.id, "starting_nil", e.target.value)} placeholder="Starting Available NIL 0-100"/>
              <input style={input} value={draft.overall_nil_budget} onChange={(e)=>setTeamDraft(team.id, "overall_nil_budget", e.target.value)} placeholder="Overall NIL Budget 0-100"/>
              <div style={draftAssetPreviewV40}>
                <span style={prestigePreviewLineV57}>Prestige <PrestigeStars team={previewTeam} size={14}/> | OFF {previewTeam.draft_offense ?? previewTeam.offense_rating ?? previewTeam.off ?? "—"} | DEF {previewTeam.draft_defense ?? previewTeam.defense_rating ?? previewTeam.def ?? "—"} | OVR {previewTeam.draft_overall ?? previewTeam.overall_rating ?? previewTeam.ovr ?? "—"} · Board Score {draftTeamRating(previewTeam)}</span>
              </div>
              <button type="button" style={dirty ? saveAssetButtonDirtyV61 : saveAssetButtonV61} onClick={()=>saveTeamAsset(team)}>
                {dirty ? "Save Team Asset" : "Saved"}
              </button>
            </div>
          );
        })}
      </div>

      <section style={conferenceLogoSectionV54}>
        <div style={sectionTop}>
          <div>
            <h2 style={sectionTitle}>Conference Logos</h2>
            <p style={mutedText}>Paste direct image URLs for conference logos, then click Save Conference Logo.</p>
          </div>
        </div>
        <div style={conferenceLogoGridV54}>
          {conferenceRows.map((row)=>{
            const draftLogo = confDraft(row);
            const dirty = String(row.logo_url || "") !== String(draftLogo || "");
            return (
              <div key={row.conference_name} style={conferenceLogoCardV54}>
                <div style={conferenceLogoPreviewV54}>
                  {draftLogo ? <img src={draftLogo} alt="" style={conferenceLogoImgV54}/> : <ConferenceLogoMark conference={row.conference_name} conferenceAssets={conferenceAssets} size={58}/>}
                </div>
                <b>{row.conference_name}</b>
                <input style={input} value={draftLogo} onChange={(e)=>setConfDraft(row.conference_name, e.target.value)} placeholder={`${row.conference_name} Logo URL`}/>
                <button type="button" style={dirty ? saveAssetButtonDirtyV61 : saveAssetButtonV61} onClick={()=>saveConfAsset(row)}>
                  {dirty ? "Save Conference Logo" : "Saved"}
                </button>
              </div>
            );
          })}
        </div>
      </section>
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
    .filter((row)=>userControlledTeamIdsForRanks.has(String(row.team?.id)))
    .map((row, index)=>({ ...row, rank:index + 1 }));
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

  const tabs = [["results","Results"],["recruiting","Recruiting"],["awards","Awards"],["aa","All-Americans"]];

  return (
    <section style={broadcastPageCard}>
      <h2 style={sectionTitle}>League Data Center</h2>
      <p style={mutedText}>One clean hub for league data entry. Discord users auto-populate from active team assignments. Unassigned opponents are treated as CPU.</p>
      <div style={dataCenterTabs}>{tabs.map(([key,label])=><button key={key} style={{...dataCenterTab, borderColor: activeForm===key ? "#facc15" : "rgba(255,255,255,.16)"}} onClick={()=>setActiveForm(key)}>{label}</button>)}</div>

      {activeForm === "results" && <div style={entryPanel}><h3 style={miniTitle}>Results</h3><div style={entryGrid}>
        <select style={input} value={result.season_year} onChange={(e)=>{ const nextYear=e.target.value; const yearResults=(results || []).filter((row)=>String(row.season_year)===String(nextYear)); const userTeamIds=new Set(assignments.filter((a)=>a.status==="Active" && a.discord_user_id && a.team_id).map((a)=>String(a.team_id))); const rankRows=computerRankingRows(teams, yearResults, assignments, users).filter((row)=>userTeamIds.has(String(row.team?.id))).map((row,index)=>({...row, rank:index+1})); const rankMap=new Map(rankRows.map((row)=>[String(row.team?.id), row.rank])); setResult({...result, season_year:nextYear, team_1_rank: userTeamIds.has(String(result.team_1_id)) ? (rankMap.get(String(result.team_1_id)) || "") : "", team_2_rank: userTeamIds.has(String(result.team_2_id)) ? (rankMap.get(String(result.team_2_id)) || "") : ""}); }}>{YEARS.map((year)=><option key={year}>{year}</option>)}</select>
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

function recruitingClassScore(row) {
  const five = Number(row.five_stars || 0);
  const four = Number(row.four_stars || 0);
  const three = Number(row.three_stars || 0);
  const two = Number(row.two_stars || 0);
  const one = Number(row.one_stars || 0);
  const total = five + four + three + two + one;

  if (!total) return 0;

  // Quality-first formula:
  // 5-stars are true program changers, 4-stars are blue-chip starters,
  // 3-stars are useful depth, and 1/2-stars have very limited value.
  // The diminishing factor prevents huge low-quality classes from beating smaller elite classes.
  const eliteScore = (five ** 1.08) * 75;
  const blueChipScore = (four ** 1.03) * 24;
  const solidScore = three * 4.6;
  const depthScore = two * 1.15 + one * 0.25;

  const blueChipRate = total ? (five + four) / total : 0;
  const qualityBonus = blueChipRate * 28 + five * 4.5;

  // Small volume bump, capped hard so quantity cannot carry the formula.
  const volumeBonus = Math.min(8, Math.sqrt(total) * 1.2);

  const lowQualityDrag = Math.max(0, total - (five + four + three)) * 0.35;

  return Number((eliteScore + blueChipScore + solidScore + depthScore + qualityBonus + volumeBonus - lowQualityDrag).toFixed(1));
}

function recruitingCoachName(row, users = [], assignments = []) {
  const assignment = coachForTeamYear(row.team_id, row.season_year, assignments);
  return assignment?.discord_users?.discord_username || users.find((u)=>u.id===assignment?.discord_user_id)?.discord_username || "Unassigned";
}

function RecruitingRankings({ rows, teams, users, assignments, currentYear }) {
  const [sortConfig, setSortConfig] = useState({ key:"class_score", direction:"desc" });

  const normalizedRows = (rows || []).map((row)=>{
    const team = teams.find((item)=>item.id === row.team_id) || row.teams;
    return {
      ...row,
      team,
      team_name: team?.name || "Unknown Team",
      discord_user: recruitingCoachName(row, users, assignments),
      five_stars: Number(row.five_stars || 0),
      four_stars: Number(row.four_stars || 0),
      three_stars: Number(row.three_stars || 0),
      two_stars: Number(row.two_stars || 0),
      one_stars: Number(row.one_stars || 0),
      class_score: recruitingClassScore(row),
    };
  });

  function sortRows(list) {
    return [...list].sort((a,b)=>{
      const key = sortConfig.key;
      const av = a[key];
      const bv = b[key];
      const an = Number(av);
      const bn = Number(bv);
      let cmp;
      if (!Number.isNaN(an) && !Number.isNaN(bn)) cmp = an - bn;
      else cmp = String(av ?? "").localeCompare(String(bv ?? ""));
      return sortConfig.direction === "asc" ? cmp : -cmp;
    });
  }

  function toggleSort(key) {
    setSortConfig((prev)=>({ key, direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc" }));
  }

  const currentRows = sortRows(normalizedRows.filter((row)=>String(row.season_year) === String(currentYear)));
  const allTimeRows = sortRows(normalizedRows).slice(0, 25);

  const columns = [
    ["rank", "Rank"],
    ["team_name", "Team"],
    ["discord_user", "Discord User"],
    ["five_stars", "5★"],
    ["four_stars", "4★"],
    ["three_stars", "3★"],
    ["two_stars", "2★"],
    ["one_stars", "1★"],
    ["class_score", "Class Score"],
  ];

  function RecruitingTable({ title, tableRows }) {
    return (
      <section style={miniCard}>
        <div style={sectionTop}>
          <h3 style={miniTitle}>{title}</h3>
          <span style={mutedText}>{tableRows.length} classes</span>
        </div>
        <div style={allTeamsTableWrapV58} className="cfb-table-scroll">
          <table style={recruitingRankingsTableV62}>
            <thead>
              <tr>
                {columns.map(([key,label])=>(
                  <th key={key}>
                    <button type="button" style={tableSortButtonV41} onClick={()=>toggleSort(key)}>
                      {label}{sortConfig.key === key ? (sortConfig.direction === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.length ? tableRows.map((row, index)=>(
                <tr key={row.id || `${row.team_id}-${row.season_year}-${index}`} style={{...allTeamsRowV58, background:`linear-gradient(90deg, ${getTeamPrimary(row.team)}88, rgba(15,23,42,.96))`, borderColor:getTeamSecondary(row.team)}}>
                  <td>#{index + 1}</td>
                  <td><div style={allTeamsTeamCellV58}><TeamLogoMark team={row.team} size={40}/><b>{row.team_name}</b></div></td>
                  <td>{row.discord_user}</td>
                  <td>{row.five_stars}</td>
                  <td>{row.four_stars}</td>
                  <td>{row.three_stars}</td>
                  <td>{row.two_stars}</td>
                  <td>{row.one_stars}</td>
                  <td><b>{row.class_score}</b></td>
                </tr>
              )) : (
                <tr><td colSpan={columns.length} style={td}>No recruiting data yet. Add classes from League Data Center.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <section style={card}>
      <h2 style={sectionTitle}>Recruiting Class Rankings</h2>
      <p style={mutedText}>Read-only recruiting rankings powered by League Data Center entries. Class Score weights elite talent heavily: 5★ players carry the most value, while 1★ players carry minimal depth value.</p>
      <div style={recruitingReadOnlyGridV62}>
        <RecruitingTable title={`${currentYear} Class Rankings`} tableRows={currentRows}/>
        <RecruitingTable title="All-Time Best Classes" tableRows={allTimeRows}/>
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
    const margin = avgPf - avgPa;
    const qw = qualityWins(team.id, safeResults);

    // Stable 0-100 model: results drive 78% of the grade, scoring efficiency
    // contributes 14%, and ranked-win quality contributes up to 8%.
    const winPctScore = winPct * 36;
    const sorScore = (sor / 10) * 24;
    const marginScore = Math.max(0, Math.min(18, ((margin + 28) / 56) * 18));
    const offenseScore = Math.max(0, Math.min(7, (avgPf / 45) * 7));
    const defenseScore = Math.max(0, Math.min(7, ((45 - avgPa) / 45) * 7));
    const qualityWinScore = Math.min(8,(top10 * 3.5) + (Math.max(0,top25-top10) * 1.75));
    const performance = Math.max(0,Math.min(100,winPctScore+sorScore+marginScore+offenseScore+defenseScore+qualityWinScore));
    const confidence = games ? Math.min(1,.62+(games*.08)) : 0;
    const rating = Number((games ? 50+((performance-50)*confidence) : 50).toFixed(1));

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
      userTierScore: Number(opponentUserTierScore(team.id, safeResults, assignments, users).toFixed(1)),
      rating,
      score: rating,
      formulaParts: {
        winPctScore: Number(winPctScore.toFixed(1)),
        sorScore: Number(sorScore.toFixed(1)),
        marginScore: Number(marginScore.toFixed(1)),
        qualityWinScore: Number(qualityWinScore.toFixed(1)),
        offenseScore: Number(offenseScore.toFixed(1)),
        defenseScore: Number(defenseScore.toFixed(1)),
        confidence: Number(confidence.toFixed(2)),
      },
    };
  });
  return base
    .sort((a,b)=>b.rating-a.rating || b.wins-a.wins || a.losses-b.losses || b.sor-a.sor || (b.avgPf-b.avgPa)-(a.avgPf-a.avgPa) || a.teamName.localeCompare(b.teamName))
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
  width: "max-content",
  minWidth: 920,
  borderCollapse: "separate",
  borderSpacing: 0,
  color: "#f8fafc",
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
    <section style={coachFullWidthTableV41} className="cfb-scroll-card">
      <div style={sectionTop}>
        <h3 style={miniTitle}>{title}</h3>
        <span style={mutedText}>{rows.length} records</span>
      </div>

      {!sortedRows.length ? (
        <div style={coachMobileEmptyStateV56}>
          <b>{emptyText}</b>
          <small>Use League Data Center to record this data.</small>
        </div>
      ) : (
        <div style={coachStatsTableWrapV41} className="cfb-table-scroll">
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
              {sortedRows.map((row, index)=>(
                <tr key={row.id || `${title}-${index}`}>
                  {columns.map((column)=><td key={column.key}>{row[column.key] ?? "—"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}


function CoachProfile({ user, users = [], teams, assignments, results, weeklyMatchups = [], currentYear, currentWeek, rankingSnapshots = [], allAmericans, awards, heismans, nationalChampions, recruiting, seasonPlayerStats = [], teamSeasonStats = [], sportsbook = {} }) {
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
  const currentSeasonResults = results.filter((row)=>String(row.season_year)===String(currentYear));
  const currentRankings = computerRankingRows(teams.filter((team)=>assignments.some((row)=>String(row.team_id)===String(team.id)&&row.status==="Active")),currentSeasonResults,assignments,users);
  const currentRanking = currentRankings.find((row)=>String(row.team.id)===String(currentTeam?.id));
  const previousRank = previousRankingMap(rankingSnapshots,currentYear,currentWeek).get(String(currentTeam?.id));
  const nextMatchup = weeklyMatchups.find((row)=>String(row.season_year)===String(currentYear)&&String(row.week)===String(currentWeek)&&(String(row.team_1_id)===String(currentTeam?.id)||String(row.team_2_id)===String(currentTeam?.id)));
  const opponentId = nextMatchup ? (String(nextMatchup.team_1_id)===String(currentTeam?.id)?nextMatchup.team_2_id:nextMatchup.team_1_id) : null;
  const nextOpponent = teams.find((team)=>String(team.id)===String(opponentId));
  const recentForm = [...currentSeasonResults].filter((row)=>String(row.team_1_id)===String(currentTeam?.id)||String(row.team_2_id)===String(currentTeam?.id)).sort((a,b)=>weekIndex(b.week)-weekIndex(a.week)).slice(0,5).map((row)=>{
    const isTeam1=String(row.team_1_id)===String(currentTeam?.id); const pf=Number(isTeam1?row.team_1_score:row.team_2_score); const pa=Number(isTeam1?row.team_2_score:row.team_1_score); return pf>pa?"W":"L";
  });

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
    { label:"All-Americans", value:stats?.allAmericans||0, icon:"🇺🇸" },
  ];
  const milestoneRows = coachMilestonesForStats(stats);
  const coachFuturePicks=(sportsbook.futurePicks||[]).filter((pick)=>String(pick.discord_user_id)===String(safeUser.id));
  const futureOptionMap=new Map((sportsbook.options||[]).map((option)=>[String(option.id),option]));
  const futureMarketMap=new Map((sportsbook.markets||[]).map((market)=>[String(market.id),market]));
  const currentCoachFutures=coachFuturePicks.map((pick)=>({pick,option:futureOptionMap.get(String(pick.option_id)),market:futureMarketMap.get(String(pick.market_id))})).filter((row)=>String(row.market?.season_year)===String(currentYear));


  return (
    <section style={coachPageV43} className="cfb-coach-page cfb-coach-mobile-fix">
      <div className="cfb-coach-hero-v68" style={{...coachHeroV43, borderColor:`${secondary}77`, background:`linear-gradient(135deg, ${primary}e8, rgba(2,6,23,.98) 58%)`}}>
        <div className="cfb-coach-hero-identity-v68" style={coachHeroIdentityV43}>
          <TeamLogoMark team={currentTeam} size={112} plate/>
          <div>
            <div style={dashboardKickerPro}>{currentTeam?.name || "Unassigned Coach"}</div>
            <h1 className="cfb-coach-name-v68" style={coachNameV43}>{safeUser.discord_username || "Coach"}</h1>
            <p style={coachSubV37}>CFBElite Coach Profile</p>
          </div>
        </div>
        <div className="cfb-coach-hero-metrics-v68" style={coachHeroMetricsV45}>
          <div style={coachHeroMetricV45}><span>Record</span><b>{stats?.wins||0}-{stats?.losses||0}</b></div>
          <div style={coachHeroMetricV45}><span>Prestige</span><b>{coachPrestigeScore}</b><small>{coachPrestigeTier.stars} {coachPrestigeTier.label}</small></div>

        </div>
      </div>
      <section className="cfb-v2-coach-strip" style={v2CoachSeasonStrip}>
        <div><span>Current Rank</span><b>{currentRanking?`#${currentRanking.rank}`:"—"}</b><RankingMovement currentRank={currentRanking?.rank} previousRank={previousRank}/></div>
        <div><span>Season Record</span><b>{currentRanking?`${currentRanking.wins}-${currentRanking.losses}`:"0-0"}</b><small>{currentRanking?`${currentRanking.rating.toFixed(1)} rating`:"No games"}</small></div>
        <div><span>Recent Form</span><b style={v2FormDots}>{recentForm.length?recentForm.map((form,index)=><i key={index} style={form==="W"?v2FormWin:v2FormLoss}>{form}</i>):"—"}</b><small>Last {recentForm.length||0}</small></div>
        <div><span>Next Opponent</span><b style={v2NextOpponent}>{nextOpponent?<><TeamLogoMark team={nextOpponent} size={30}/>{getTeamAbbreviation(nextOpponent)}</>:"TBD"}</b><small>{nextMatchup?.week||currentWeek}</small></div>
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

      <section className="coach-elite-books-card">
        <div className="elite-section-head"><div><span>ELITE BOOKS • {currentYear}</span><h2>Futures Card</h2></div><small>Locked preseason and season-long selections</small></div>
        <div>{currentCoachFutures.length?currentCoachFutures.map(({pick,option,market})=>{const pickedCoachAssignment=option?.discord_user_id?assignments.find((row)=>String(row.discord_user_id)===String(option.discord_user_id)&&assignmentActiveForYear(row,currentYear)):null;const pickedTeam=teams.find((team)=>String(team.id)===String(option?.team_id||pickedCoachAssignment?.team_id));return <article key={pick.id}>{pickedTeam?<TeamLogoMark team={pickedTeam} size={42}/>:<span className="elite-coach-avatar">{String(option?.selection_label||"?").slice(0,1)}</span>}<span><small>{market?.title}</small><strong>{option?.selection_label||"Selection unavailable"}</strong></span><em>{formatAmericanOdds(pick.locked_odds)} • {pick.possible_points} pts</em><b className={`elite-pick-result elite-pick-${pick.status}`}>{String(pick.status).toUpperCase()}</b></article>}):<div style={v2Empty}>No {currentYear} futures have been selected.</div>}</div>
        <EliteBadgeRail sportsbook={sportsbook} discordUserId={safeUser.id} currentYear={currentYear}/>
      </section>

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
        --cfb-red: #dc2626;
        --cfb-red-dark: #7f1d1d;
        --cfb-gold: #facc15;
        --cfb-green: #35d07f;
        --cfb-ink: #05070c;
        --cfb-panel: #0b1019;
        --cfb-line: rgba(255,255,255,.12);
        --glass-bg: linear-gradient(155deg, rgba(15,21,33,.97), rgba(4,7,13,.99));
        --glass-border: rgba(255,255,255,.12);
        --glass-shadow: 0 22px 60px rgba(0,0,0,.38), inset 0 1px 0 rgba(255,255,255,.07);
      }

      * {
        box-sizing: border-box;
      }

      html, body, #root {
        min-height: 100%;
        font-family: var(--cfb-font);
        text-rendering: optimizeLegibility;
        -webkit-font-smoothing: auto;
        -moz-osx-font-smoothing: grayscale;
      }

      body {
        background:
          linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,.014) 1px, transparent 1px),
          radial-gradient(circle at 12% 0%, rgba(220,38,38,.18), transparent 30%),
          radial-gradient(circle at 88% 8%, rgba(53,208,127,.08), transparent 26%),
          linear-gradient(180deg,#05070c,#070b12 55%,#020409);
        background-size: 40px 40px,40px 40px,auto,auto,auto;
        color:#f8fafc;
      }

      ::selection { background:rgba(220,38,38,.75); color:#fff; }
      * { scrollbar-color:rgba(220,38,38,.72) rgba(255,255,255,.055); scrollbar-width:thin; }
      *::-webkit-scrollbar { width:8px; height:8px; }
      *::-webkit-scrollbar-track { background:rgba(255,255,255,.045); }
      *::-webkit-scrollbar-thumb { background:linear-gradient(180deg,#dc2626,#7f1d1d); border-radius:999px; }

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

      .cfb-table-scroll { border:1px solid rgba(255,255,255,.10); border-radius:10px; background:rgba(2,6,12,.52); box-shadow:0 14px 36px rgba(0,0,0,.22); }
      .cfb-table-scroll table thead { position:sticky; top:0; z-index:2; background:#070a10; }
      .cfb-table-scroll tbody tr { transition:background .16s ease; }
      .cfb-table-scroll tbody tr:hover { background:rgba(220,38,38,.065); }
      .cfb-v2-page h1,.cfb-v2-page h2,.cfb-v2-page h3 { font-family:var(--cfb-display); }
      .cfb-v2-page h2 { letter-spacing:-.035em; }
      .cfb-v2-page input,.cfb-v2-page select,.cfb-v2-page textarea {
        background:#070b12 !important;
        border-color:rgba(148,163,184,.28) !important;
        box-shadow:inset 0 1px rgba(255,255,255,.035);
      }
      .cfb-v2-page input:hover,.cfb-v2-page select:hover,.cfb-v2-page textarea:hover { border-color:rgba(248,113,113,.44) !important; }
      .cfb-v2-page input:focus,.cfb-v2-page select:focus,.cfb-v2-page textarea:focus { border-color:#ef4444 !important; box-shadow:0 0 0 3px rgba(220,38,38,.12); }
      .cfb-v2-page > section { transition:border-color .18s ease, box-shadow .18s ease, transform .18s ease; }
      .cfb-v2-page > section:hover { border-color:rgba(255,255,255,.16) !important; }

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
          animation-duration: 54s !important;
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

      /* v54-assets-mobile */
      @media (max-width: 720px) {
        [style*="repeat(auto-fit, minmax(min(100%, 310px), 1fr))"],
        [style*="repeat(auto-fit, minmax(min(100%, 260px), 1fr))"] {
          grid-template-columns: 1fr !important;
        }

        input,
        select {
          width: 100% !important;
        }
      }

      /* v56-coach-mobile-scroll */
      .cfb-table-scroll {
        overflow-x: auto !important;
        overflow-y: hidden !important;
        -webkit-overflow-scrolling: touch !important;
        touch-action: pan-x pan-y !important;
        max-width: 100% !important;
        width: 100% !important;
      }

      .cfb-scroll-card {
        max-width: 100% !important;
        overflow: hidden !important;
      }

      .cfb-coach-page {
        max-width: 100% !important;
        overflow-x: hidden !important;
      }

      @media (max-width: 760px) {
        .cfb-coach-page table {
          min-width: 920px !important;
          width: max-content !important;
        }

        .cfb-coach-page h1,
        .cfb-coach-page h2,
        .cfb-coach-page h3 {
          max-width: 100% !important;
          overflow-wrap: normal !important;
        }

        .cfb-coach-page .cfb-table-scroll::-webkit-scrollbar {
          height: 8px;
        }

        .cfb-coach-page .cfb-table-scroll::-webkit-scrollbar-thumb {
          background: rgba(212,175,55,.5);
          border-radius: 999px;
        }
      }

      /* v58-coach-mobile-cleanup */
      @media (max-width: 760px) {
        .cfb-coach-mobile-fix {
          display: grid !important;
          gap: 14px !important;
          overflow-x: hidden !important;
          padding-bottom: 20px !important;
        }

        .cfb-coach-mobile-fix > section,
        .cfb-coach-mobile-fix > div {
          max-width: 100% !important;
          overflow: hidden !important;
        }

        .cfb-coach-mobile-fix .cfb-table-scroll {
          overflow-x: auto !important;
          overflow-y: hidden !important;
          -webkit-overflow-scrolling: touch !important;
          touch-action: pan-x pan-y !important;
          padding-bottom: 10px !important;
        }

        .cfb-coach-mobile-fix h1 {
          font-size: clamp(34px, 12vw, 56px) !important;
          line-height: .92 !important;
        }

        .cfb-coach-mobile-fix h2 {
          font-size: clamp(26px, 8vw, 42px) !important;
        }

        .cfb-coach-mobile-fix h3 {
          font-size: clamp(20px, 6vw, 28px) !important;
        }

        .cfb-coach-mobile-fix table {
          min-width: 760px !important;
          width: max-content !important;
        }

        .cfb-coach-mobile-fix td,
        .cfb-coach-mobile-fix th {
          white-space: nowrap !important;
        }
      }

      /* v59-dashboard-table-align */
      .cfb-dashboard-power-table-head,
      .cfb-dashboard-power-table-list > * {
        box-sizing: border-box !important;
      }

      @media (max-width: 760px) {
        .cfb-dashboard-power-table-head {
          min-width: 980px !important;
          grid-template-columns: 58px minmax(230px,1.25fr) minmax(120px,.7fr) 54px 54px 80px 80px 78px 70px 82px !important;
          gap: 12px !important;
          padding-left: 16px !important;
          padding-right: 16px !important;
        }

        .cfb-dashboard-power-table-list > * {
          min-width: 980px !important;
          grid-template-columns: 58px minmax(230px,1.25fr) minmax(120px,.7fr) 54px 54px 80px 80px 78px 70px 82px !important;
          gap: 12px !important;
        }
      }

      /* v64-dashboard-sections-mobile */
      @media (max-width: 960px) {
        [style*="minmax(0, 1.15fr) minmax(280px, .75fr) minmax(280px, .85fr)"] {
          grid-template-columns: 1fr !important;
        }
      }

      @media (max-width: 640px) {
        [style*="110px minmax(0,1fr)"] {
          grid-template-columns: 1fr !important;
          justify-items: start !important;
        }

        [style*="70px minmax(0,1fr) minmax(0,1fr)"] {
          grid-template-columns: 1fr !important;
        }
      }

      /* v68-mobile-layout-fixes */
      @media (max-width: 760px) {
        body {
          overflow-x: hidden !important;
        }

        [style*="clamp(44px, 8vw, 92px)"] {
          font-size: clamp(40px, 12vw, 56px) !important;
          line-height: .92 !important;
          max-width: calc(100vw - 72px) !important;
          white-space: normal !important;
        }

        [style*="minmax(0, 1.35fr) minmax(260px, .65fr)"] {
          grid-template-columns: 1fr !important;
        }

        .cfb-dashboard-tile-grid-v68,
        [style*="repeat(auto-fit, minmax(240px, 1fr))"] {
          grid-template-columns: 1fr !important;
        }

        .cfb-dashboard-feature-grid-v68 {
          grid-template-columns: 1fr !important;
        }

        [style*="minmax(0, 1.15fr) minmax(280px, .75fr) minmax(280px, .85fr)"] {
          grid-template-columns: 1fr !important;
        }

        .cfb-dashboard-power-table-head,
        .cfb-dashboard-power-table-list > * {
          min-width: 1120px !important;
          grid-template-columns: 64px minmax(260px, 1.4fr) minmax(150px,.8fr) 64px 64px 86px 86px 86px 82px 92px !important;
        }

        .cfb-coach-hero-v68 {
          grid-template-columns: 1fr !important;
          padding: 18px !important;
          border-radius: 22px !important;
          min-width: 0 !important;
        }

        .cfb-coach-hero-identity-v68 {
          grid-template-columns: 84px minmax(0,1fr) !important;
          gap: 12px !important;
          align-items: center !important;
        }

        .cfb-coach-hero-identity-v68 [style*="width: 112px"],
        .cfb-coach-hero-identity-v68 [style*="width:112px"] {
          width: 84px !important;
          height: 84px !important;
          min-width: 84px !important;
          min-height: 84px !important;
        }

        .cfb-coach-name-v68 {
          font-size: clamp(34px, 12vw, 52px) !important;
          line-height: .9 !important;
          letter-spacing: -.055em !important;
          max-width: 100% !important;
          overflow-wrap: anywhere !important;
        }

        .cfb-coach-hero-metrics-v68 {
          grid-template-columns: 1fr 1fr !important;
          width: 100% !important;
        }

        .cfb-coach-mobile-fix > section,
        .cfb-coach-mobile-fix > div {
          overflow: hidden !important;
        }

        .cfb-table-scroll,
        .cfb-scroll-card {
          max-width: 100% !important;
          overflow-x: auto !important;
          -webkit-overflow-scrolling: touch !important;
        }

        .cfb-results-manager {
          overflow-x: hidden !important;
        }
      }

      @media (max-width: 520px) {
        [style*="clamp(44px, 8vw, 92px)"] {
          font-size: 42px !important;
        }

        .cfb-coach-hero-identity-v68 {
          grid-template-columns: 76px minmax(0,1fr) !important;
        }

        .cfb-coach-name-v68 {
          font-size: 38px !important;
        }
      }

      /* v69-best-available-conference-badge */
      @media (max-width: 760px) {
        [style*="max-width: calc(100% - 68px)"] {
          font-size: 9px !important;
          padding: 4px 6px !important;
        }
      }

      /* v70-best-available-badge-anchor-fix */
      @media (max-width: 760px) {
        [style*="position: absolute"][style*="max-width: calc(100% - 72px)"] {
          max-width: 48% !important;
          font-size: 9px !important;
          padding: 4px 6px !important;
          right: 10px !important;
          top: 10px !important;
        }
      }

      /* v76-coach-card-name-fit */
      [style*="No active team"] {
        overflow-wrap: anywhere;
      }
      @media (max-width: 760px) {
        [style*="No active team"] {
          font-size: clamp(11px, 2.6vw, 13px) !important;
        }
      }

      /* v77-nil-pipeline-draft-cards */
      @media (max-width: 760px) {
        [style*="grid-template-columns: repeat(3, 1fr)"][style*="NIL"] {
          grid-template-columns: 1fr !important;
        }
      }

      /* v78-coach-tabs-alpha-fit */
      [style*="coach"] button,
      [style*="No active team"] {
        min-width: 0 !important;
      }

      @media (max-width: 760px) {
        [style*="No active team"] {
          font-size: clamp(10px, 2.8vw, 12px) !important;
          line-height: 1.15 !important;
          overflow-wrap: anywhere !important;
        }
      }

      /* v79-available-best-grid */
      @media (max-width: 760px) {
        [style*="repeat(auto-fill, minmax(190px, 1fr))"] {
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)) !important;
        }
      }

      /* v86-coach-menu-logo-bleed-fix */
      .coach-menu-logo-plate-v86,
      .coach-menu-logo-plate-v86 * {
        overflow: hidden !important;
      }

      /* v87-gamecenter-mobile */
      @media (max-width: 760px) {
        .cfb-gamecenter-filters-v87 { grid-template-columns: 1fr !important; }
      }

      @media (max-width: 900px) {
        .cfb-dashboard-feature-grid-v89 { grid-template-columns: 1fr !important; }
        .cfb-conference-power-head-v89 { display:none !important; }
        .cfb-conference-power-row-v89 { grid-template-columns:46px 1.3fr .9fr .8fr !important; }
        .cfb-conference-power-row-v89 > span:nth-child(4),
        .cfb-conference-power-row-v89 > span:nth-child(5),
        .cfb-conference-power-row-v89 > span:nth-child(6),
        .cfb-conference-power-row-v89 > span:nth-child(7) { display:none !important; }
      }
      @media (max-width: 620px) {
        .cfb-gamecenter-meta-v89 { display:grid !important; grid-template-columns:1fr !important; }
        .cfb-dashboard-season-weeks-v89 { grid-template-columns:1fr !important; }
      }

      /* v90-gamecenter-fixes */
      @media (max-width: 620px) {
        .cfb-gamecenter-filters-v87 {
          grid-template-columns:1fr !important;
        }
        .cfb-gamecenter-card-v89 {
          min-width:0 !important;
        }
        .cfb-conference-power-row-v89 {
          grid-template-columns:42px 54px 1fr 64px !important;
          gap:6px !important;
        }
      }

      /* v91-gamecenter-live-and-mobile */
      @media (max-width: 900px) {
        .cfb-conference-power-row-v89 {
          grid-template-columns:42px 58px minmax(0,1fr) 64px !important;
          gap:8px !important;
        }
        .cfb-conference-power-row-v89 > span:nth-child(4),
        .cfb-conference-power-row-v89 > span:nth-child(5),
        .cfb-conference-power-row-v89 > span:nth-child(6),
        .cfb-conference-power-row-v89 > span:nth-child(7) {
          display:none !important;
        }
        .cfb-conference-mobile-metrics-v91 {
          display:grid !important;
        }
        .cfb-conference-mobile-metrics-v91 span {
          display:grid !important;
          gap:3px;
          text-align:center;
          min-width:0;
        }
        .cfb-conference-mobile-metrics-v91 small {
          font-size:8px;
          color:rgba(226,232,240,.58);
          font-weight:1000;
        }
        .cfb-conference-mobile-metrics-v91 b {
          font-size:11px;
          color:#fff;
        }
      }
      @media (max-width: 560px) {
        .cfb-conference-mobile-metrics-v91 {
          grid-template-columns:repeat(3,minmax(0,1fr)) !important;
        }
      }

      /* v2-presentation-system */
      * { box-sizing: border-box; }
      button, input, select, textarea { font: inherit; }
      button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, a:focus-visible {
        outline: 3px solid rgba(250,204,21,.72) !important;
        outline-offset: 2px;
      }
      .cfb-v2-page { animation: cfbV2Fade .28s ease both; }
      .cfb-v2-week-tabs { scrollbar-width: thin; }
      .cfb-v2-week-tabs::-webkit-scrollbar { height: 6px; }
      .cfb-v2-week-tabs::-webkit-scrollbar-thumb { background: rgba(148,163,184,.35); border-radius: 999px; }
      .cfb-v2-ranking-row > span, .cfb-v2-ranking-row > strong { white-space:nowrap; }
      .cfb-v2-conference-scroll, .cfb-v2-ranking-table-scroll { scrollbar-width:thin; scrollbar-color:rgba(220,38,38,.7) rgba(255,255,255,.06); }
      .cfb-mobile-nav-v2 { display:none !important; }
      @keyframes cfbV2Fade { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:none; } }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { animation-duration:.01ms !important; transition-duration:.01ms !important; scroll-behavior:auto !important; }
      }
      @media (max-width: 1050px) {
        .cfb-v2-home-grid, .cfb-v2-admin-grid { grid-template-columns:1fr !important; }
        .cfb-v2-kpi-grid { grid-template-columns:repeat(2,minmax(0,1fr)) !important; }
        .cfb-v2-leader-grid { grid-template-columns:repeat(2,minmax(0,1fr)) !important; }
        .cfb-v2-game-grid, .cfb-v2-media-grid, .cfb-v2-user-grid { grid-template-columns:repeat(2,minmax(0,1fr)) !important; }
      }
      @media (max-width: 760px) {
        body { padding-bottom:82px; }
        .cfb-mobile-nav-v2 { display:grid !important; }
        .cfb-v2-page { gap:12px !important; }
        .cfb-v2-page > section:not(.elite-ticker) { border-radius:8px !important; }
        .cfb-table-scroll { margin-top:14px !important; border-radius:7px; }
        .cfb-table-scroll th { position:sticky; top:0; z-index:2; }
        .cfb-v2-page button { min-height:42px; }
        .cfb-v2-page input,.cfb-v2-page select,.cfb-v2-page textarea { min-height:44px; font-size:16px !important; }
        .cfb-v2-dashboard-hero { grid-template-columns:1fr !important; align-items:start !important; }
        .cfb-v2-dashboard-hero > * { min-width:0 !important; width:100% !important; }
        .cfb-v2-filter-inputs { grid-template-columns:1fr !important; }
        .cfb-v2-featured-matchup { grid-template-columns:1fr !important; }
        .cfb-v2-game-grid, .cfb-v2-media-grid, .cfb-v2-user-grid, .cfb-v2-bye-grid, .cfb-v2-playoff-grid, .cfb-v2-form-grid { grid-template-columns:1fr !important; }
        .cfb-v2-coach-strip { grid-template-columns:repeat(2,minmax(0,1fr)) !important; }
        .cfb-v2-page h1 { font-size:clamp(34px,10vw,50px) !important; }
        .cfb-v2-table-panel-head { min-width:0; flex-wrap:nowrap !important; }
        .cfb-v2-table-panel-head > div { min-width:0; }
        .cfb-v2-table-panel-head h2 { overflow-wrap:anywhere; }
        .cfb-v2-active-count { flex:0 1 auto; max-width:46%; min-width:0 !important; height:auto !important; min-height:30px; padding:6px 11px; line-height:1.15; text-align:center; white-space:normal; overflow-wrap:anywhere; }
        .cfb-v2-ranking-head, .cfb-v2-ranking-row {
          grid-template-columns:44px 155px 52px 62px 60px 68px 66px 66px 82px !important;
          min-width:735px !important;
          gap:6px !important;
          padding-left:8px !important;
          padding-right:8px !important;
        }
        .cfb-v2-ranking-head > :nth-child(1),
        .cfb-v2-ranking-row > :nth-child(1) {
          position:sticky; left:0; z-index:4;
          align-self:stretch; display:flex; align-items:center;
          background:#11151e;
        }
        .cfb-v2-ranking-head > :nth-child(2),
        .cfb-v2-ranking-row > :nth-child(2) {
          position:sticky; left:50px; z-index:4;
          align-self:stretch;
          background:#11151e;
          box-shadow:12px 0 14px -12px rgba(0,0,0,.95);
        }
        .cfb-v2-ranking-head > :nth-child(1),
        .cfb-v2-ranking-head > :nth-child(2) { z-index:6; background:#05070c; }
        .cfb-v2-ranking-row > :nth-child(2) { display:grid; }
        .cfb-v2-ranking-row > :nth-child(2) strong,
        .cfb-v2-ranking-row > :nth-child(2) small { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .cfb-v2-conference-head, .cfb-v2-conference-row {
          grid-template-columns:42px 150px 64px 82px 70px 64px 76px 82px 70px 52px !important;
          min-width:790px !important;
          gap:6px !important;
          padding-left:8px !important;
          padding-right:8px !important;
        }
        .cfb-v2-conference-head > :nth-child(1),
        .cfb-v2-conference-row > :nth-child(1) {
          position:sticky; left:0; z-index:4;
          align-self:stretch; display:flex; align-items:center;
          background:#11151e;
        }
        .cfb-v2-conference-head > :nth-child(2),
        .cfb-v2-conference-row > :nth-child(2) {
          position:sticky; left:48px; z-index:4;
          align-self:stretch;
          overflow:hidden;
          background:#11151e;
          box-shadow:12px 0 14px -12px rgba(0,0,0,.95);
        }
        .cfb-v2-conference-head > :nth-child(1),
        .cfb-v2-conference-head > :nth-child(2) { z-index:6; background:#05070c; }
        .cfb-v2-conference-row > :nth-child(2) strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      }
      @media (max-width: 520px) {
        .cfb-v2-kpi-grid, .cfb-v2-coach-strip { grid-template-columns:1fr !important; }
        .cfb-v2-leader-grid { grid-template-columns:1fr !important; }
        .cfb-v2-page { gap:12px !important; }
      }

      /* v21 non-sportsbook presentation polish */
      .cfb-v2-page:not(.elite-books-page):not(.elite-books-manager-page) h1,
      .cfb-v2-page:not(.elite-books-page):not(.elite-books-manager-page) h2 { text-wrap:balance; }
      .cfb-v2-page:not(.elite-books-page):not(.elite-books-manager-page) > section:not([class*="elite-"]) {
        position:relative;
        isolation:isolate;
      }
      .cfb-v2-page:not(.elite-books-page):not(.elite-books-manager-page) > section:not([class*="elite-"])::before {
        content:"";
        position:absolute;
        z-index:-1;
        inset:0 0 auto;
        height:1px;
        background:linear-gradient(90deg,rgba(239,68,68,.65),rgba(250,204,21,.22),transparent 72%);
        pointer-events:none;
      }
      .cfb-v2-game-grid > article,
      .cfb-v2-user-grid > article,
      .cfb-v2-media-grid > article,
      .cfb-v2-bye-grid > div,
      .cfb-v2-playoff-grid > div {
        min-width:0;
        overflow:hidden;
        transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease;
      }
      .cfb-v2-matchup-team { min-width:0; overflow:hidden; }
      .cfb-v2-matchup-team > strong,
      .cfb-v2-matchup-team > span { max-width:100%; overflow-wrap:anywhere; }
      .cfb-v2-ranking-table-scroll,
      .cfb-v2-conference-scroll,
      .cfb-table-scroll {
        overscroll-behavior-inline:contain;
        scroll-snap-type:x proximity;
      }
      @media (hover:hover) and (pointer:fine) {
        .cfb-v2-game-grid > article:hover,
        .cfb-v2-user-grid > article:hover,
        .cfb-v2-media-grid > article:hover,
        .cfb-v2-bye-grid > div:hover,
        .cfb-v2-playoff-grid > div:hover {
          transform:translateY(-2px);
          border-color:rgba(248,113,113,.40) !important;
          box-shadow:0 20px 48px rgba(0,0,0,.34) !important;
        }
      }
      @media (max-width:760px) {
        .cfb-v2-page:not(.elite-books-page):not(.elite-books-manager-page) > section:not([class*="elite-"]) { padding:14px !important; }
        .cfb-v2-page:not(.elite-books-page):not(.elite-books-manager-page) h2 {
          font-size:clamp(24px,7vw,34px) !important;
          line-height:1.04;
        }
        .cfb-v2-matchup-team > strong { font-size:13px !important; line-height:1.15; }
        .cfb-v2-matchup-team > span { font-size:11px !important; }
        .cfb-v2-ranking-table-scroll,
        .cfb-v2-conference-scroll,
        .cfb-table-scroll { -webkit-overflow-scrolling:touch; }
      }

      /* Elite Books broadcast system */
      .elite-books-page { --book-green:#35d07f; --book-dark:#07110d; --book-panel:#0b1312; color:#f8fafc; }
      .elite-books-hero { position:relative; overflow:hidden; display:grid; grid-template-columns:minmax(0,1.5fr) minmax(280px,.55fr); gap:24px; padding:clamp(24px,4vw,48px); border:1px solid rgba(53,208,127,.34); border-radius:26px; background:radial-gradient(circle at 75% 0%,rgba(53,208,127,.19),transparent 34%),linear-gradient(125deg,#07110d,#101917 62%,#07110d); box-shadow:0 28px 70px rgba(0,0,0,.38),inset 0 1px rgba(255,255,255,.07); }
      .elite-books-hero::after { content:"EB"; position:absolute; right:30%; bottom:-55px; font-size:210px; line-height:1; font-weight:1000; font-style:italic; color:rgba(255,255,255,.025); transform:skew(-8deg); pointer-events:none; }
      .elite-books-hero > div:first-child { position:relative; z-index:1; }
      .elite-books-hero > div:first-child > span,.elite-history-hero span,.elite-myteam-login > span,.elite-myteam-hero > div > span { color:var(--book-green,#35d07f); font-size:11px; font-weight:1000; letter-spacing:.18em; }
      .elite-books-hero h1 { margin:7px 0 4px; font-size:clamp(52px,8vw,98px); line-height:.82; letter-spacing:-.07em; font-weight:1000; font-style:italic; }
      .elite-books-hero h1 i { color:var(--book-green); }
      .elite-books-hero p { margin:16px 0; color:#cbd5e1; font-size:clamp(16px,2vw,21px); font-weight:800; }
      .elite-books-rule-pills { display:flex; flex-wrap:wrap; gap:8px; }
      .elite-books-rule-pills b { padding:8px 11px; border:1px solid rgba(53,208,127,.2); border-radius:999px; color:#d1fae5; background:rgba(53,208,127,.08); font-size:10px; letter-spacing:.04em; }
      .elite-auth-card { position:relative; z-index:2; align-self:stretch; display:flex; flex-direction:column; justify-content:center; gap:6px; padding:22px; border:1px solid rgba(255,255,255,.13); border-top:3px solid var(--book-green); border-radius:18px; background:rgba(0,0,0,.34); box-shadow:0 18px 40px rgba(0,0,0,.25); }
      .elite-auth-card span { color:var(--book-green); font-size:10px; font-weight:1000; letter-spacing:.14em; }
      .elite-auth-card strong { font-size:21px; }
      .elite-auth-card small { color:#94a3b8; line-height:1.4; }
      .elite-auth-card button,.elite-history-hero button,.elite-myteam-login button,.elite-myteam-hero button,.elite-myteam-grid button { margin-top:10px; border:0; border-radius:9px; padding:11px 14px; color:#03100a; background:var(--book-green,#35d07f); font-weight:1000; cursor:pointer; }
      .elite-ticker { min-width:0; display:grid; grid-template-columns:116px minmax(0,1fr); overflow:hidden; border:1px solid rgba(148,163,184,.18); border-radius:14px; background:#070b12; box-shadow:0 16px 35px rgba(0,0,0,.22); }
      .elite-ticker-label { display:flex; flex-direction:column; justify-content:center; align-items:flex-start; padding:12px 15px; border:0; color:white; background:linear-gradient(135deg,#b91c1c,#701414); cursor:pointer; }
      .elite-ticker-label span { font-size:9px; letter-spacing:.18em; font-weight:1000; }
      .elite-ticker-label b { font-size:17px; }
      .elite-ticker-label small { opacity:.74; }
      .elite-ticker-viewport { min-width:0; overflow:hidden; position:relative; }
      .elite-ticker-viewport::after { content:""; position:absolute; inset:0 0 0 auto; width:34px; pointer-events:none; background:linear-gradient(90deg,transparent,#070b12); }
      .elite-ticker-track { display:flex; width:max-content; min-width:100%; gap:0; will-change:transform; backface-visibility:hidden; animation:eliteTickerLoop var(--elite-ticker-duration,42s) linear infinite; }
      .elite-ticker-group { display:flex; flex:0 0 auto; gap:0; min-width:0; }
      .elite-ticker-viewport:hover .elite-ticker-track,.elite-ticker-viewport:focus-within .elite-ticker-track { animation-play-state:paused; }
      @keyframes eliteTickerLoop { from { transform:translate3d(0,0,0); } to { transform:translate3d(-50%,0,0); } }
      .elite-ticker-game { flex:0 0 260px; width:260px; min-width:260px; max-width:260px; display:grid; grid-template-columns:minmax(0,1fr) auto minmax(0,1fr); align-items:center; gap:8px; padding:10px 15px; overflow:hidden; contain:layout paint; border:0; border-right:1px solid rgba(148,163,184,.14); color:#e2e8f0; background:#070b12; cursor:pointer; }
      .elite-ticker-game > span { min-width:0; overflow:hidden; display:flex; align-items:center; gap:5px; font-size:12px; }
      .elite-ticker-game > span > * { flex:0 0 auto; }
      .elite-ticker-game > span > b { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .elite-ticker-game > span:nth-of-type(2){justify-content:flex-end;}
      .elite-ticker-game > strong { color:white; font-size:12px; }
      .elite-ticker-game > em { grid-column:1/-1; color:#94a3b8; font-size:8px; font-style:normal; font-weight:900; letter-spacing:.12em; }
      .elite-ticker-empty { padding:22px; color:#94a3b8; }
      @media (prefers-reduced-motion:reduce) { .elite-ticker-viewport { overflow-x:auto; scrollbar-width:none; } .elite-ticker-viewport::-webkit-scrollbar { display:none; } .elite-ticker-track { animation:none; } .elite-ticker-group[aria-hidden="true"] { display:none; } }
      .elite-books-scorebar { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); border:1px solid rgba(53,208,127,.18); border-radius:14px; background:#09100f; overflow:hidden; }
      .elite-books-scorebar > div { display:flex; flex-direction:column; gap:4px; padding:14px 18px; border-right:1px solid rgba(255,255,255,.08); }
      .elite-books-scorebar span { color:#64748b; font-size:9px; font-weight:1000; letter-spacing:.15em; }
      .elite-books-scorebar b { font-size:13px; overflow-wrap:anywhere; }
      .elite-status { color:#facc15; font-size:10px !important; letter-spacing:.09em; }
      .elite-status-open { color:#35d07f; } .elite-status-settled { color:#60a5fa; } .elite-status-locked { color:#fb923c; }
      .elite-books-layout { display:grid; grid-template-columns:minmax(0,1fr) 340px; gap:18px; align-items:start; }
      .elite-books-main,.elite-books-sidebar,.elite-futures,.elite-history-table,.elite-champions,.elite-badge-gallery,.coach-elite-books-card { border:1px solid rgba(148,163,184,.17); border-radius:20px; padding:20px; background:linear-gradient(145deg,rgba(15,23,42,.93),rgba(5,12,12,.96)); box-shadow:0 18px 48px rgba(0,0,0,.25); }
      .elite-section-head { display:flex; justify-content:space-between; gap:12px; align-items:end; margin-bottom:16px; }
      .elite-section-head span { color:#35d07f; font-size:9px; font-weight:1000; letter-spacing:.16em; }
      .elite-section-head h2 { margin:3px 0 0; font-size:22px; letter-spacing:-.03em; }
      .elite-section-head > small { max-width:390px; color:#64748b; text-align:right; line-height:1.35; }
      .elite-section-head button { border:0; color:#35d07f; background:transparent; font-size:11px; font-weight:1000; cursor:pointer; }
      .elite-lines-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
      .elite-line-card { position:relative; overflow:hidden; border:1px solid rgba(148,163,184,.18); border-radius:16px; background:linear-gradient(120deg,color-mix(in srgb,var(--team-one) 25%,#090f16),#090f16 48%,color-mix(in srgb,var(--team-two) 25%,#090f16)); }
      .elite-line-card::before { content:""; position:absolute; inset:0; background:linear-gradient(110deg,transparent 46%,rgba(255,255,255,.025) 46% 54%,transparent 54%); pointer-events:none; }
      .elite-line-card > header,.elite-line-card > footer { position:relative; display:flex; align-items:center; justify-content:space-between; padding:10px 13px; border-bottom:1px solid rgba(255,255,255,.08); font-size:9px; font-weight:1000; letter-spacing:.12em; }
      .elite-line-card > header b { color:#35d07f; }
      .elite-line-card.betting-closed { border-color:rgba(248,113,113,.5); }
      .elite-line-card.betting-closed > header b { color:#f87171; }
      .elite-line-matchup { position:relative; display:grid; grid-template-columns:1fr 38px 1fr; align-items:start; gap:4px; padding:16px 10px; }
      .elite-line-matchup > div { min-width:0; display:flex; flex-direction:column; align-items:center; gap:4px; text-align:center; }
      .elite-line-matchup > div > b { color:#94a3b8; font-size:11px; }
      .elite-line-matchup > div > strong { min-height:32px; font-size:12px; line-height:1.25; }
      .elite-line-matchup > span { align-self:center; color:#35d07f; font-size:15px; font-weight:1000; font-style:italic; }
      .elite-final-score { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; text-align:center; padding:8px 15px; background:rgba(0,0,0,.35); }
      .elite-final-score b { font-size:25px; } .elite-final-score span { color:#35d07f; font-size:9px; font-weight:1000; }
      .elite-betting-closed { display:flex;align-items:center;justify-content:center;gap:8px;padding:8px 12px;border-block:1px solid rgba(248,113,113,.22);color:#fecaca;background:rgba(127,29,29,.24);font-size:9px; } .elite-betting-closed b { color:#f87171;letter-spacing:.1em; }
      .elite-market { position:relative; display:grid; grid-template-columns:70px 1fr 1fr; gap:7px; align-items:stretch; padding:7px 10px; }
      .elite-market > label { align-self:center; color:#64748b; font-size:8px; font-weight:1000; letter-spacing:.12em; }
      .elite-pick-button { min-width:0; display:grid; grid-template-columns:1fr auto; gap:2px 7px; padding:8px; border:1px solid rgba(148,163,184,.2); border-radius:8px; color:#f8fafc; background:rgba(2,6,23,.72); cursor:pointer; }
      .elite-pick-button span { min-width:0; overflow:hidden; text-overflow:ellipsis; font-size:10px; font-weight:1000; }
      .elite-pick-button b { color:#fff; font-size:16px; line-height:1; font-weight:1000; letter-spacing:-.02em; }
      .elite-pick-button em { grid-column:1/-1; color:#94a3b8; font-size:9px; line-height:1; font-style:normal; font-weight:900; text-align:right; }
      .elite-pick-button small { grid-column:1/-1; color:#35d07f; font-size:9px; line-height:1; font-weight:1000; text-align:right; letter-spacing:.06em; }
      .elite-pick-button.selected { border-color:#35d07f; background:rgba(53,208,127,.17); box-shadow:inset 0 0 0 1px rgba(53,208,127,.26); }
      .elite-pick-button:disabled { cursor:not-allowed; opacity:.62; }
      .elite-total-market { margin-top:2px; padding-top:9px; border-top:1px dashed rgba(148,163,184,.16); }
      .elite-ticket-submit { position:relative; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; align-items:center; margin:7px 10px 10px; padding:10px 11px; border:1px solid rgba(148,163,184,.16); border-radius:10px; background:rgba(2,6,23,.68); }
      .elite-ticket-submit.has-draft { border-color:rgba(53,208,127,.55); background:rgba(53,208,127,.08); }
      .elite-ticket-submit span { color:#94a3b8; font-size:10px; line-height:1.35; font-weight:800; }
      .elite-ticket-submit.has-draft span { color:#d1fae5; }
      .elite-ticket-submit button { min-width:112px; padding:10px 13px; border:1px solid #35d07f; border-radius:8px; color:#02130b; background:#35d07f; font-size:10px; font-weight:1000; letter-spacing:.08em; cursor:pointer; }
      .elite-ticket-submit button:disabled { border-color:rgba(148,163,184,.18); color:#64748b; background:rgba(15,23,42,.75); cursor:not-allowed; }
      .elite-line-card > footer { border-top:1px solid rgba(255,255,255,.08); border-bottom:0; color:#64748b; letter-spacing:0; font-weight:700; }
      .elite-leaderboard { display:grid; gap:7px; }
      .elite-leaderboard > div,.elite-history-table > div:not(.elite-section-head):not(.elite-history-ledger-scroll):not(.elite-empty-small) { display:grid; grid-template-columns:32px minmax(0,1fr) auto; gap:9px; align-items:center; padding:10px; border:1px solid rgba(148,163,184,.12); border-radius:10px; background:rgba(2,6,23,.44); }
      .elite-leaderboard > div.me { border-color:rgba(53,208,127,.5); background:rgba(53,208,127,.09); }
      .elite-leaderboard > div > b,.elite-history-table > div > b { color:#35d07f; }
      .elite-leaderboard span,.elite-history-table span { min-width:0; display:flex; flex-direction:column; }
      .elite-leaderboard strong,.elite-history-table strong { overflow:hidden; text-overflow:ellipsis; }
      .elite-leaderboard small,.elite-history-table small { color:#64748b; font-size:9px; }
      .elite-leaderboard em,.elite-history-table em { color:#fff; font-size:11px; font-style:normal; font-weight:1000; }
      .elite-badge-rail { display:flex; flex-wrap:wrap; gap:8px; margin-top:18px; padding-top:15px; border-top:1px solid rgba(148,163,184,.13); }
      .elite-badge-rail > div { flex-basis:100%; display:flex; justify-content:space-between; }
      .elite-badge-rail > div span { color:#35d07f; font-size:8px; font-weight:1000; letter-spacing:.12em; }
      .elite-badge-rail > div b { font-size:11px; }
      .elite-badge-rail > span { display:flex; align-items:center; gap:5px; padding:6px 8px; border:1px solid rgba(250,204,21,.2); border-radius:999px; background:rgba(250,204,21,.07); }
      .elite-badge-mark { width:38px; height:38px; display:grid; place-items:center; flex:0 0 auto; border:1px solid rgba(53,208,127,.42); border-radius:50%; color:#35d07f; background:linear-gradient(145deg,rgba(53,208,127,.15),rgba(2,6,23,.9)); font-size:10px!important; line-height:1; font-style:normal; font-weight:1000; letter-spacing:-.04em; }
      .elite-badge-rail > span .elite-badge-mark { width:24px;height:24px;font-size:7px!important; } .elite-badge-rail > span strong { font-size:8px; }
      .elite-badge-rail > small { color:#64748b; line-height:1.4; }
      .elite-futures-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
      .elite-future-card { overflow:hidden; border:1px solid rgba(148,163,184,.15); border-radius:14px; background:#080e13; }
      .elite-future-card > header { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:13px; border-bottom:1px solid rgba(148,163,184,.13); background:linear-gradient(90deg,rgba(53,208,127,.1),transparent); }
      .elite-future-card > header > div { display:flex; align-items:center; gap:9px; }
      .elite-future-card > header span { display:flex; flex-direction:column; }
      .elite-future-card > header small { color:#35d07f; font-size:8px; font-weight:1000; text-transform:uppercase; }
      .elite-future-card > header strong { font-size:13px; }
      .elite-future-card > header > b { color:#35d07f; font-size:8px; letter-spacing:.1em; }
      .elite-future-options { max-height:340px; overflow-y:auto; padding:7px; }
      .elite-future-options button { width:100%; display:grid; grid-template-columns:38px minmax(0,1fr) auto; align-items:center; gap:8px; margin:4px 0; padding:8px; border:1px solid transparent; border-radius:8px; color:#f8fafc; text-align:left; background:rgba(255,255,255,.025); cursor:pointer; }
      .elite-future-options button:hover { background:rgba(255,255,255,.06); }
      .elite-future-options button.selected { border-color:#35d07f; background:rgba(53,208,127,.12); }
      .elite-future-options button:disabled { cursor:not-allowed; }
      .elite-future-options button > span:nth-child(2) { min-width:0; display:flex; flex-direction:column; }
      .elite-future-options button strong { overflow:hidden; text-overflow:ellipsis; font-size:10px; }
      .elite-future-options button small { color:#e2e8f0; font-size:13px; font-weight:1000; }
      .elite-future-options button em { color:#35d07f; font-size:11px; font-style:normal; font-weight:1000; }
      .elite-coach-avatar { width:32px; height:32px; display:grid; place-items:center; border:1px solid rgba(53,208,127,.4); border-radius:50%; color:#35d07f; background:rgba(53,208,127,.1); font-weight:1000; }
      .elite-empty,.elite-empty-small { display:flex; flex-direction:column; gap:6px; padding:30px; border:1px dashed rgba(148,163,184,.25); border-radius:12px; color:#64748b; text-align:center; }
      .elite-empty b { color:#cbd5e1; letter-spacing:.08em; }
      .elite-books-home { display:grid; grid-template-columns:minmax(290px,1.35fr) repeat(3,minmax(170px,.65fr)); overflow:hidden; border:1px solid rgba(53,208,127,.25); border-radius:18px; background:linear-gradient(125deg,#07110d,#0c1714); box-shadow:0 18px 50px rgba(0,0,0,.27); }
      .elite-books-home > div { min-width:0; padding:22px; border-right:1px solid rgba(255,255,255,.08); }
      .elite-books-home-brand { background:radial-gradient(circle at 100% 0%,rgba(53,208,127,.2),transparent 46%); }
      .elite-books-home-brand > span,.elite-books-home-board span,.elite-books-home-leaders > span,.elite-books-home-me > span { color:#35d07f; font-size:10px; font-weight:1000; letter-spacing:.15em; }
      .elite-books-home-brand h2 { margin:4px 0; font-size:34px; line-height:1; font-style:italic; letter-spacing:-.05em; } .elite-books-home-brand h2 i { color:#35d07f; }
      .elite-books-home-brand p { margin:7px 0 13px; color:#a8b3c4; font-size:12px; line-height:1.4; }
      .elite-books-home button { border:0; padding:0; color:#35d07f; background:transparent; font-size:11px; font-weight:1000; cursor:pointer; }
      .elite-books-home-board,.elite-books-home-me { display:flex; flex-direction:column; gap:7px; }
      .elite-books-home-board > div { display:flex; justify-content:space-between; gap:5px; }
      .elite-books-home-board > strong,.elite-books-home-me > strong { margin-top:auto; font-size:31px; line-height:1; }
      .elite-books-home-board small,.elite-books-home-me small,.elite-books-home-leaders > small { color:#7f8da3; font-size:11px; line-height:1.35; }
      .elite-books-home-leaders { display:flex; flex-direction:column; gap:8px; }
      .elite-books-home-leaders > div { display:grid; grid-template-columns:26px minmax(0,1fr) auto; gap:7px; font-size:11px; align-items:center; }
      .elite-books-home-leaders > div b { color:#35d07f; } .elite-books-home-leaders > div strong { overflow:hidden;text-overflow:ellipsis; } .elite-books-home-leaders > div em { font-style:normal; color:#94a3b8; }
      .elite-history-hero { display:flex; justify-content:space-between; align-items:end; gap:20px; padding:30px; border-radius:22px; background:linear-gradient(135deg,#07110d,#14251e); border:1px solid rgba(53,208,127,.25); }
      .elite-history-hero h1 { margin:4px 0; font-size:clamp(40px,6vw,72px); letter-spacing:-.06em; }
      .elite-history-hero p { color:#94a3b8; }
      .elite-history-grid { display:grid; grid-template-columns:minmax(0,1.5fr) minmax(260px,.5fr); gap:16px; }
      .elite-history-table { display:grid; gap:7px; }
      .elite-history-ledger { min-width:0; }
      .elite-history-ledger-scroll { min-width:0; overflow-x:auto; border:1px solid rgba(148,163,184,.16); border-radius:11px; background:rgba(2,6,23,.38); }
      .elite-history-ledger-head,.elite-history-ledger-row { display:grid; grid-template-columns:48px minmax(180px,1.5fr) 88px 72px 90px 82px 76px 72px 78px; gap:10px; align-items:center; min-width:860px; padding:11px 13px; }
      .elite-history-ledger-head { position:sticky; top:0; z-index:5; border-bottom:2px solid #35d07f; color:#94a3b8; background:#070b12; font-size:10px; font-weight:1000; letter-spacing:.08em; text-transform:uppercase; }
      .elite-history-ledger-row { min-height:62px; border-bottom:1px solid rgba(148,163,184,.12); color:#e5e7eb; background:rgba(15,23,42,.38); font-size:13px; font-weight:750; }
      .elite-history-ledger-row:last-child { border-bottom:0; }
      .elite-history-ledger-row > b { color:#35d07f; font-size:14px; }
      .elite-history-ledger-row > span:nth-child(2) { min-width:0; display:grid; gap:3px; }
      .elite-history-ledger-row > span:nth-child(2) strong { overflow:hidden; color:#fff; font-size:14px; line-height:1.15; text-overflow:ellipsis; white-space:nowrap; }
      .elite-history-ledger-row > span:nth-child(2) small { color:#94a3b8; font-size:10px; font-weight:650; }
      .elite-history-ledger-row > em { color:#fff; font-size:14px; font-style:normal; font-weight:1000; text-align:right; }
      @media (max-width:760px) {
        .elite-history-ledger-head,.elite-history-ledger-row { grid-template-columns:44px 150px 78px 66px 82px 76px 70px 66px 72px; min-width:750px; gap:6px; padding-inline:8px; }
        .elite-history-ledger-head > :nth-child(1),.elite-history-ledger-row > :nth-child(1) { position:sticky; left:0; z-index:6; align-self:stretch; display:flex; align-items:center; background:#0d1522; }
        .elite-history-ledger-head > :nth-child(2),.elite-history-ledger-row > :nth-child(2) { position:sticky; left:50px; z-index:6; align-self:stretch; background:#0d1522; box-shadow:12px 0 14px -12px rgba(0,0,0,.95); }
        .elite-history-ledger-head > :nth-child(1),.elite-history-ledger-head > :nth-child(2) { z-index:8; background:#070b12; }
      }
      .elite-champions > div:not(.elite-section-head) { display:grid; gap:4px; padding:12px; border-bottom:1px solid rgba(148,163,184,.13); }
      .elite-champions > div > b { color:#35d07f; } .elite-champions > div > span,.elite-champions p { color:#64748b; }
      .elite-badge-gallery > div:last-child { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; }
      .elite-badge-gallery article { display:flex; flex-direction:column; gap:5px; padding:14px; border:1px solid rgba(148,163,184,.13); border-radius:10px; background:rgba(2,6,23,.4); }
      .elite-badge-gallery article small { color:#64748b; line-height:1.35; }
      .coach-elite-books-card > div:nth-child(2) { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
      .coach-elite-books-card article { display:grid; grid-template-columns:46px minmax(0,1fr) auto; gap:9px; align-items:center; padding:11px; border:1px solid rgba(53,208,127,.18); border-radius:10px; background:rgba(53,208,127,.05); }
      .coach-elite-books-card article > span { display:flex; flex-direction:column; min-width:0; } .coach-elite-books-card article small { color:#35d07f; font-size:8px; } .coach-elite-books-card article strong { overflow:hidden;text-overflow:ellipsis; }
      .coach-elite-books-card article em { font-size:9px; font-style:normal; font-weight:900; }
      .coach-elite-books-card article > b { grid-column:2/-1; color:#94a3b8; font-size:8px; text-align:right; }
      .elite-pick-won { color:#35d07f !important; } .elite-pick-lost { color:#f87171 !important; }
      .elite-myteam-login { max-width:760px; margin:40px auto; padding:50px; border:1px solid rgba(53,208,127,.24); border-radius:24px; text-align:center; background:linear-gradient(145deg,#07110d,#111827); }
      .elite-myteam-login h1 { margin:5px; font-size:60px; } .elite-myteam-login p { color:#94a3b8; }
      .elite-myteam-hero { display:grid; grid-template-columns:130px minmax(0,1fr) auto; align-items:center; gap:20px; padding:28px; border:1px solid color-mix(in srgb,var(--my-secondary) 50%,transparent); border-radius:22px; background:linear-gradient(125deg,color-mix(in srgb,var(--my-primary) 70%,#020617),#071018); }
      .elite-myteam-hero h1 { margin:4px 0; font-size:clamp(34px,5vw,66px); letter-spacing:-.06em; } .elite-myteam-hero p { margin:0;color:#cbd5e1; }
      .elite-myteam-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; }
      .elite-myteam-grid article { display:flex; flex-direction:column; gap:10px; padding:20px; border:1px solid rgba(148,163,184,.15); border-radius:16px; background:linear-gradient(145deg,rgba(15,23,42,.92),rgba(5,12,12,.96)); }
      .elite-myteam-grid article > span { color:#35d07f; font-size:9px;font-weight:1000;letter-spacing:.14em; } .elite-myteam-grid article > div { display:flex; align-items:center;gap:10px; } .elite-myteam-grid article > small { color:#64748b; }
      .elite-myteam-points { font-size:34px; }
      .elite-manager-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
      .elite-manager-grid article { display:flex; flex-direction:column; gap:8px; padding:22px; border:1px solid rgba(53,208,127,.2); border-radius:16px; background:linear-gradient(145deg,#07110d,#111827); }
      .elite-manager-grid article > span { color:#35d07f;font-size:9px;font-weight:1000;letter-spacing:.15em; } .elite-manager-grid article h2 { margin:0; } .elite-manager-grid article p,.elite-manager-grid article small { color:#94a3b8; }
      .elite-manager-grid button,.elite-manager-markets button { border:0;border-radius:8px;padding:10px;color:#03100a;background:#35d07f;font-weight:1000;cursor:pointer; }
      .elite-manager-markets { display:grid;gap:8px; } .elite-manager-markets > div { display:grid;grid-template-columns:minmax(180px,1fr) minmax(200px,1fr) 90px;gap:10px;align-items:center;padding:10px;border:1px solid rgba(148,163,184,.12);border-radius:10px; } .elite-manager-markets span { display:flex;flex-direction:column; } .elite-manager-markets small { color:#64748b; } .elite-manager-markets select { width:100%;padding:9px;border:1px solid rgba(148,163,184,.2);border-radius:8px;color:#fff;background:#0f172a; }
      .elite-matchup-locks { display:grid;gap:8px; } .elite-matchup-locks > div { display:grid;grid-template-columns:minmax(100px,1fr) 26px minmax(100px,1fr) minmax(120px,.7fr) minmax(220px,.9fr);gap:10px;align-items:center;padding:10px 12px;border:1px solid rgba(53,208,127,.18);border-radius:10px;background:rgba(53,208,127,.04); } .elite-matchup-locks > div.locked { border-color:rgba(248,113,113,.34);background:rgba(127,29,29,.13); } .elite-matchup-locks > div.voided { border-color:rgba(148,163,184,.28);background:rgba(71,85,105,.13); } .elite-matchup-locks > div > span { display:flex;align-items:center;gap:7px; } .elite-matchup-locks > div > b { color:#64748b;text-align:center;font-size:10px; } .elite-matchup-locks > div > em { color:#35d07f;font-size:9px;font-style:normal;font-weight:1000;letter-spacing:.08em; } .elite-matchup-locks > div.locked > em { color:#f87171; } .elite-matchup-actions { display:grid;grid-template-columns:1fr 1fr;gap:7px; } .elite-matchup-locks button { border:1px solid rgba(248,113,113,.35);border-radius:8px;padding:9px;color:#fecaca;background:rgba(127,29,29,.22);font-size:9px;font-weight:1000;cursor:pointer; } .elite-matchup-locks > div.locked button { border-color:rgba(53,208,127,.35);color:#d1fae5;background:rgba(53,208,127,.12); } .elite-matchup-locks button.void-matchup { border-color:rgba(148,163,184,.32);color:#e2e8f0;background:rgba(51,65,85,.32); } .elite-matchup-locks button:disabled { opacity:.45;cursor:not-allowed; }
      .elite-seed-grid { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px; } .elite-seed-grid > article { min-width:0;display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px;border:1px solid rgba(148,163,184,.13);border-radius:11px;background:rgba(2,6,23,.42); } .elite-seed-grid > article > div { grid-column:1/-1;min-width:0;display:flex;align-items:center;gap:9px; } .elite-seed-grid > article > div > span { min-width:0;display:flex;flex-direction:column; } .elite-seed-grid > article strong,.elite-seed-grid > article small { overflow:hidden;text-overflow:ellipsis;white-space:nowrap; } .elite-seed-grid > article small { color:#64748b;font-size:8px; } .elite-seed-grid label { display:flex;flex-direction:column;gap:4px;padding:7px;border:1px solid rgba(148,163,184,.1);border-radius:8px;background:rgba(255,255,255,.025); } .elite-seed-grid label span { overflow:hidden;text-overflow:ellipsis;font-size:8px;font-weight:1000;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em; } .elite-seed-grid input { width:100%;padding:8px;border:1px solid rgba(53,208,127,.25);border-radius:7px;color:#fff;background:#07110d;text-align:center;font-weight:1000; } .elite-seed-grid > article > p { grid-column:1/-1;margin:2px 0 0;padding-top:8px;border-top:1px solid rgba(148,163,184,.1);color:#94a3b8;font-size:9px;line-height:1.4; }
      .elite-discord-drawer { display:flex;align-items:center;justify-content:space-between;gap:10px;margin:12px 0;padding:12px;border:1px solid rgba(88,101,242,.35);border-radius:12px;background:rgba(88,101,242,.1); }
      .elite-discord-drawer > div { min-width:0;display:flex;flex-direction:column; } .elite-discord-drawer span { color:#a5b4fc;font-size:8px;font-weight:1000;letter-spacing:.12em; } .elite-discord-drawer strong { overflow:hidden;text-overflow:ellipsis; } .elite-discord-drawer button { flex:0 0 auto;border:0;border-radius:7px;padding:8px 10px;color:#fff;background:#5865f2;font-size:9px;font-weight:1000;cursor:pointer; }
      .elite-commissioner-access { display:flex;justify-content:space-between;align-items:center;gap:18px;padding:20px;border:1px solid rgba(167,139,250,.32);border-radius:16px;background:linear-gradient(135deg,rgba(76,29,149,.22),rgba(15,23,42,.92)); } .elite-commissioner-access span { color:#c4b5fd;font-size:9px;font-weight:1000;letter-spacing:.15em; } .elite-commissioner-access h2 { margin:4px 0;font-size:22px; } .elite-commissioner-access p { max-width:780px;margin:0;color:#94a3b8;line-height:1.45; } .elite-commissioner-access > strong { flex:0 0 auto;padding:10px 13px;border:1px solid rgba(167,139,250,.32);border-radius:999px;color:#ddd6fe;background:rgba(139,92,246,.12);font-size:11px; }
      .elite-user-statuses { display:flex;flex-direction:column;align-items:flex-end;gap:5px; } .elite-commissioner-badge { padding:5px 7px;border:1px solid rgba(167,139,250,.38);border-radius:999px;color:#ddd6fe;background:rgba(139,92,246,.13);font-size:7px;font-weight:1000;letter-spacing:.08em; }
      .elite-commissioner-toggle { width:100%;margin-top:10px;padding:9px;border-radius:8px;font-size:9px;font-weight:1000;cursor:pointer; } .elite-commissioner-toggle.grant { border:1px solid rgba(167,139,250,.34);color:#ddd6fe;background:rgba(139,92,246,.12); } .elite-commissioner-toggle.revoke { border:1px solid rgba(248,113,113,.3);color:#fecaca;background:rgba(127,29,29,.16); } .elite-commissioner-toggle:disabled { opacity:.45;cursor:not-allowed; }
      .league-login-shell { min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 20% 10%,rgba(37,99,235,.22),transparent 35%),radial-gradient(circle at 85% 80%,rgba(220,38,38,.22),transparent 38%),#020617;color:#fff; }
      .league-login-card { width:min(920px,100%);overflow:hidden;display:grid;grid-template-columns:230px minmax(0,1fr);gap:30px;align-items:center;padding:44px;border:1px solid rgba(96,165,250,.25);border-top:4px solid #dc2626;border-radius:26px;background:linear-gradient(135deg,rgba(5,12,26,.98),rgba(15,23,42,.96));box-shadow:0 40px 120px rgba(0,0,0,.55); }
      .league-login-mark { width:210px;height:210px;display:grid;place-content:center;text-align:center;border:3px solid #facc15;border-radius:50%;background:radial-gradient(circle,#172554,#030712 70%);box-shadow:inset 0 0 0 8px #dc2626,0 0 60px rgba(37,99,235,.28);transform:rotate(-4deg); }
      .league-login-mark span { font-size:25px;font-weight:1000;letter-spacing:.12em; }.league-login-mark strong { color:#facc15;font-size:49px;line-height:.86;font-style:italic;letter-spacing:-.07em; }.league-login-mark b { color:#60a5fa;font-size:46px;line-height:.95; }
      .league-login-kicker { color:#facc15;font-size:10px;font-weight:1000;letter-spacing:.2em; }.league-login-card h1 { margin:8px 0;font-size:clamp(36px,6vw,70px);line-height:.94;letter-spacing:-.06em; }.league-login-card p { max-width:580px;color:#a8b3c7;font-size:16px;line-height:1.55; }.league-login-actions { grid-column:2;display:flex;gap:10px; }.league-login-actions button { min-height:48px;padding:0 22px;border:0;border-radius:10px;color:#fff;background:#5865f2;font-weight:1000;cursor:pointer; }.league-login-actions button.secondary { border:1px solid rgba(148,163,184,.25);background:#0f172a; }.league-login-loader { color:#60a5fa;font-size:11px;font-weight:1000;letter-spacing:.16em;animation:networkPulse 1.2s infinite; }.league-login-error { grid-column:2;padding:11px;border:1px solid rgba(248,113,113,.35);border-radius:9px;color:#fecaca;background:rgba(127,29,29,.2); }.league-login-card footer { grid-column:1/-1;display:flex;justify-content:space-between;padding-top:20px;border-top:1px solid rgba(148,163,184,.15);color:#64748b;font-size:8px;font-weight:1000;letter-spacing:.12em; }
      @keyframes networkPulse { 50% { opacity:.35; } }
      .network-page,.redzone-page { font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
      .network-home-panel { display:grid;grid-template-columns:minmax(0,1.7fr) minmax(170px,.55fr) minmax(210px,.7fr);overflow:hidden;border:1px solid rgba(56,189,248,.22);border-radius:17px;background:linear-gradient(125deg,#06131f,#0b1420);box-shadow:0 18px 50px rgba(0,0,0,.22); }.network-home-panel > button { min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:5px;padding:20px;border:0;border-right:1px solid rgba(255,255,255,.08);color:#fff;text-align:left;background:transparent;cursor:pointer; }.network-home-panel > button:first-child { background:radial-gradient(circle at 90% 0%,rgba(56,189,248,.15),transparent 42%); }.network-home-panel > button:last-child { border-right:0; }.network-home-panel span { color:#38bdf8;font-size:8px;font-weight:1000;letter-spacing:.16em; }.network-home-panel h2 { max-width:760px;margin:2px 0;overflow:hidden;font-size:18px;line-height:1.3;text-overflow:ellipsis;white-space:nowrap; }.network-home-panel strong { margin-top:auto;font-size:34px;line-height:1; }.network-home-panel small { color:#64748b;font-size:9px; }.network-home-panel b { margin-top:auto;color:#7dd3fc;font-size:9px; }.network-home-panel button.live { background:radial-gradient(circle at 100% 0%,rgba(220,38,38,.25),transparent 55%); }.network-home-panel button.live span,.network-home-panel button.live b { color:#f87171; }
      .network-hero,.redzone-hero { position:relative;overflow:hidden;display:flex;align-items:end;justify-content:space-between;gap:20px;padding:32px;border:1px solid rgba(56,189,248,.25);border-radius:22px;background:radial-gradient(circle at 85% 10%,rgba(14,165,233,.18),transparent 35%),linear-gradient(130deg,#06121f,#0f172a);box-shadow:0 24px 70px rgba(0,0,0,.25); }
      .network-hero::before,.redzone-hero::before { content:"";position:absolute;inset:0;background:linear-gradient(105deg,transparent 45%,rgba(255,255,255,.03) 45% 55%,transparent 55%);pointer-events:none; }.network-hero > div,.redzone-hero > div { position:relative; }.network-hero > div:first-child > span,.redzone-hero > div:first-child > span { color:#38bdf8;font-size:10px;font-weight:1000;letter-spacing:.2em; }.network-hero h1,.redzone-hero h1 { margin:4px 0;font-size:clamp(50px,8vw,90px);line-height:.88;letter-spacing:-.07em; }.network-hero p,.redzone-hero p { margin:12px 0 0;color:#94a3b8;font-size:15px; }.network-live-presence,.redzone-hero > div:last-child { min-width:160px;display:grid;grid-template-columns:12px 1fr;align-items:center;gap:2px 9px;padding:15px 18px;border:1px solid rgba(56,189,248,.25);border-radius:14px;background:rgba(2,6,23,.55); }.network-live-presence i,.redzone-hero i { width:10px;height:10px;border-radius:50%;background:#22c55e;box-shadow:0 0 18px #22c55e;animation:networkPulse 1.5s infinite; }.network-live-presence strong,.redzone-hero strong { font-size:30px;line-height:1; }.network-live-presence span,.redzone-hero > div:last-child span { grid-column:2;color:#7dd3fc;font-size:8px;font-weight:1000;letter-spacing:.12em; }
      .network-layout { min-height:680px;display:grid;grid-template-columns:290px minmax(0,1fr);overflow:hidden;border:1px solid rgba(148,163,184,.16);border-radius:20px;background:#070d17; }.network-sidebar { border-right:1px solid rgba(148,163,184,.15);background:linear-gradient(180deg,#091321,#070b12); }.network-sidebar > nav { display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:12px;border-bottom:1px solid rgba(148,163,184,.12); }.network-sidebar > nav button { position:relative;padding:10px 6px;border:1px solid transparent;border-radius:8px;color:#718096;background:transparent;font-size:10px;font-weight:1000;cursor:pointer; }.network-sidebar > nav button.active { border-color:rgba(56,189,248,.3);color:#e0f2fe;background:rgba(14,165,233,.12); }.network-sidebar > nav button b { position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;display:grid;place-items:center;border-radius:999px;color:#fff;background:#dc2626;font-size:8px; }
      .network-channel-list,.network-conversation-list,.network-member-results { display:grid;gap:4px;padding:9px; }.network-channel-list > button { min-width:0;display:grid;grid-template-columns:34px minmax(0,1fr);gap:9px;align-items:center;padding:10px;border:1px solid transparent;border-radius:10px;color:#cbd5e1;text-align:left;background:transparent;cursor:pointer; }.network-channel-list > button > b { width:32px;height:32px;display:grid;place-items:center;border-radius:8px;color:#38bdf8;background:rgba(14,165,233,.11);font-size:9px; }.network-channel-list > button > span { min-width:0;display:grid;gap:2px; }.network-channel-list strong { font-size:12px; }.network-channel-list small { overflow:hidden;color:#64748b;font-size:8px;text-overflow:ellipsis;white-space:nowrap; }.network-channel-list > button.active { border-color:rgba(56,189,248,.25);background:rgba(14,165,233,.1); }.network-member-search { display:grid;gap:6px;padding:12px; }.network-member-search span { color:#38bdf8;font-size:8px;font-weight:1000;letter-spacing:.14em; }.network-member-search input,.redzone-profile-form input,.redzone-profile-form select { min-width:0;padding:11px;border:1px solid rgba(148,163,184,.2);border-radius:9px;color:#fff;background:#080f1b; }.network-member-results { max-height:250px;overflow-y:auto;border-block:1px solid rgba(148,163,184,.12); }.network-member-results button,.network-conversation-list button { display:flex;align-items:center;justify-content:space-between;gap:7px;padding:9px;border:1px solid transparent;border-radius:9px;color:#fff;text-align:left;background:transparent;cursor:pointer; }.network-conversation-list button.active { border-color:rgba(56,189,248,.25);background:rgba(14,165,233,.1); }.network-conversation-list button > small { color:#64748b;font-size:7px; }
      .network-identity { min-width:0;display:flex!important;align-items:center!important;flex-direction:row!important;gap:9px!important;text-align:left; }.network-identity > span { min-width:0;display:grid;gap:1px; }.network-identity strong { overflow:hidden;font-size:11px;text-overflow:ellipsis;white-space:nowrap; }.network-identity small { overflow:hidden;color:#64748b;font-size:8px;text-overflow:ellipsis;white-space:nowrap; }.network-identity.compact strong { font-size:10px; }
      .network-stage { min-width:0;display:grid;grid-template-rows:auto minmax(0,1fr) auto;background:radial-gradient(circle at 90% 0%,rgba(14,165,233,.05),transparent 35%); }.network-stage-header,.network-notifications > header,.network-settings > header,.redzone-directory > header { display:flex;align-items:center;justify-content:space-between;gap:20px;padding:20px 22px;border-bottom:1px solid rgba(148,163,184,.14); }.network-stage-header span,.network-notifications header span,.network-settings header span,.redzone-directory header span { color:#38bdf8;font-size:8px;font-weight:1000;letter-spacing:.16em; }.network-stage-header h2,.network-notifications h2,.network-settings h2,.redzone-directory h2 { margin:3px 0;font-size:24px; }.network-stage-header p,.network-settings header p { margin:0;color:#64748b;font-size:10px; }.network-stage-header button,.network-notifications header button,.redzone-directory header button { border:1px solid rgba(56,189,248,.3);border-radius:8px;padding:9px 12px;color:#bae6fd;background:rgba(14,165,233,.1);font-size:9px;font-weight:1000;cursor:pointer; }
      .network-message-feed { min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:18px; }.network-message-feed article { position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 12px;padding:11px 13px;border:1px solid rgba(148,163,184,.11);border-radius:12px;background:rgba(15,23,42,.55); }.network-message-feed article.mine { border-color:rgba(56,189,248,.18);background:rgba(14,165,233,.07); }.network-message-feed article p { grid-column:1/-1;margin:0;color:#e2e8f0;font-size:13px;line-height:1.5;white-space:pre-wrap; }.network-message-feed article time { color:#64748b;font-size:8px; }.network-empty,.redzone-empty { min-height:260px;display:grid;place-content:center;gap:6px;color:#64748b;text-align:center; }.network-empty b,.redzone-empty b { color:#cbd5e1;font-size:18px; }.network-composer { display:grid;grid-template-columns:minmax(0,1fr) 100px;gap:8px;padding:14px;border-top:1px solid rgba(148,163,184,.14);background:#080f19; }.network-composer textarea { min-height:52px;max-height:130px;resize:vertical;padding:12px;border:1px solid rgba(148,163,184,.2);border-radius:10px;color:#fff;background:#050b13;font:inherit; }.network-composer button { border:0;border-radius:9px;color:#04131c;background:#38bdf8;font-weight:1000;cursor:pointer; }.network-composer small { grid-column:1/-1;color:#475569;font-size:8px; }
      .network-notifications,.network-settings { min-height:0;overflow-y:auto; }.network-notifications > button { width:calc(100% - 28px);display:grid;grid-template-columns:10px minmax(0,1fr);gap:10px;margin:7px 14px;padding:13px;border:1px solid rgba(148,163,184,.12);border-radius:10px;color:#fff;text-align:left;background:rgba(15,23,42,.45);cursor:pointer; }.network-notifications > button.unread { border-color:rgba(56,189,248,.35);background:rgba(14,165,233,.1); }.network-notifications > button i { width:8px;height:8px;margin-top:5px;border-radius:50%;background:#334155; }.network-notifications > button.unread i { background:#38bdf8;box-shadow:0 0 10px #38bdf8; }.network-notifications > button span { display:grid;gap:3px; }.network-notifications p { margin:0;color:#94a3b8;font-size:11px; }.network-notifications small { color:#475569;font-size:8px; }.network-settings > section { display:flex;align-items:center;justify-content:space-between;gap:20px;margin:10px 16px;padding:14px;border:1px solid rgba(56,189,248,.15);border-radius:12px;background:rgba(14,165,233,.05); }.network-settings > section > div,.network-setting-grid label span { display:grid;gap:3px; }.network-settings small,.network-setting-grid small { color:#64748b;font-size:9px; }.network-settings button { border:1px solid rgba(56,189,248,.28);border-radius:8px;padding:8px 11px;color:#bae6fd;background:rgba(14,165,233,.1);font-size:9px;font-weight:1000;cursor:pointer; }.network-setting-actions { display:flex;align-items:center;gap:10px; }.network-settings input[type="checkbox"] { width:20px;height:20px;accent-color:#38bdf8; }.network-setting-grid { display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px 16px 20px; }.network-setting-grid label { display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px;border:1px solid rgba(148,163,184,.12);border-radius:10px;background:rgba(15,23,42,.4); }
      .redzone-hero { border-color:rgba(239,68,68,.35);background:radial-gradient(circle at 85% 10%,rgba(220,38,38,.23),transparent 35%),linear-gradient(130deg,#1c0608,#0f172a); }.redzone-hero > div:first-child > span,.redzone-hero > div:last-child span { color:#f87171; }.redzone-hero i { background:#ef4444;box-shadow:0 0 18px #ef4444; }.redzone-hero > div:last-child { border-color:rgba(239,68,68,.32); }.redzone-multiview { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:8px;border:1px solid rgba(239,68,68,.28);border-radius:16px;background:#020409; }.redzone-multiview.streams-1 { grid-template-columns:1fr; }.redzone-multiview article { min-width:0;overflow:hidden;border:1px solid rgba(148,163,184,.2);border-radius:10px;background:#000; }.redzone-multiview article header { display:flex;align-items:center;justify-content:space-between;padding:7px 9px;background:#090f18; }.redzone-multiview article header button { border:0;color:#fff;background:transparent;font-size:20px;cursor:pointer; }.redzone-multiview iframe { width:100%;aspect-ratio:16/9;display:block;border:0;background:#000; }.redzone-player-fallback { aspect-ratio:16/9;display:grid;place-content:center;gap:10px;padding:20px;color:#94a3b8;text-align:center; }.redzone-player-fallback a { color:#f87171; }.redzone-directory { overflow:hidden;border:1px solid rgba(148,163,184,.15);border-radius:18px;background:#070c14; }.redzone-directory header span { color:#f87171; }.redzone-directory header button { border-color:rgba(239,68,68,.35);color:#fecaca;background:rgba(127,29,29,.2); }.redzone-profile-form { display:grid;grid-template-columns:130px 1fr 1.2fr 1fr auto;gap:8px;padding:13px;border-bottom:1px solid rgba(148,163,184,.14);background:rgba(127,29,29,.08); }.redzone-profile-form button { border:0;border-radius:9px;padding:0 14px;color:#fff;background:#dc2626;font-weight:1000; }.redzone-profile-form small { grid-column:1/-1;color:#64748b; }.redzone-stream-grid { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:14px; }.redzone-stream-grid > article { min-width:0;overflow:hidden;display:grid;grid-template-rows:auto 1fr auto;border:1px solid rgba(148,163,184,.14);border-radius:14px;background:linear-gradient(145deg,color-mix(in srgb,var(--stream-team) 22%,#080e17),#080e17 58%); }.redzone-stream-grid > article.live { border-color:rgba(239,68,68,.55);box-shadow:0 0 0 1px rgba(239,68,68,.12),0 18px 45px rgba(127,29,29,.18); }.redzone-thumb { position:relative;aspect-ratio:16/9;display:grid;place-items:center;overflow:hidden;background:#020617; }.redzone-thumb > img { width:100%;height:100%;object-fit:cover; }.redzone-thumb > b,.redzone-thumb > span { position:absolute;top:9px;padding:5px 7px;border-radius:6px;font-size:8px;font-weight:1000;letter-spacing:.1em; }.redzone-thumb > b { left:9px;color:#fff;background:#475569; }.redzone-stream-grid article.live .redzone-thumb > b { background:#dc2626; }.redzone-thumb > span { right:9px;color:#cbd5e1;background:rgba(2,6,23,.78); }.redzone-stream-grid article > div:nth-child(2) { display:grid;gap:8px;padding:13px; }.redzone-stream-grid h3 { margin:0;font-size:15px; }.redzone-stream-grid p { margin:0;color:#64748b;font-size:10px;line-height:1.45; }.redzone-stream-grid footer { display:grid;grid-template-columns:1fr auto;gap:7px;padding:11px;border-top:1px solid rgba(148,163,184,.12); }.redzone-stream-grid footer button,.redzone-stream-grid footer a { display:grid;place-items:center;min-height:36px;border:1px solid rgba(239,68,68,.3);border-radius:8px;color:#fecaca;background:rgba(127,29,29,.15);font-size:8px;font-weight:1000;text-decoration:none;cursor:pointer; }.redzone-stream-grid footer button.selected { color:#fff;background:#dc2626; }.redzone-stream-grid footer button:disabled { opacity:.38;cursor:not-allowed; }.redzone-stream-grid footer a { padding:0 9px;border-color:rgba(148,163,184,.2);color:#cbd5e1;background:#0f172a; }
      @media (max-width:1100px) {
        .elite-books-layout { grid-template-columns:1fr; }
        .elite-books-sidebar { display:grid;grid-template-columns:1fr 1fr;gap:16px; }
        .elite-books-sidebar > .elite-section-head { grid-column:1/-1; }
        .elite-books-home { grid-template-columns:1fr 1fr; } .elite-books-home-brand { grid-column:1/-1; }
        .redzone-stream-grid { grid-template-columns:1fr 1fr; }.redzone-profile-form { grid-template-columns:1fr 1fr; }.redzone-profile-form button { min-height:42px; }
        .network-home-panel { grid-template-columns:1fr 1fr; }.network-home-panel > button:first-child { grid-column:1/-1; }.network-home-panel > button:nth-child(2) { border-top:1px solid rgba(255,255,255,.08); }.network-home-panel > button:last-child { border-top:1px solid rgba(255,255,255,.08); }
      }
      @media (max-width:760px) {
        .elite-books-hero { grid-template-columns:1fr; padding:22px; border-radius:18px; }
        .elite-books-hero h1 { font-size:clamp(54px,18vw,78px) !important; }
        .elite-books-scorebar { grid-template-columns:1fr 1fr; }
        .elite-lines-grid,.elite-futures-grid,.elite-history-grid,.elite-myteam-grid,.elite-manager-grid { grid-template-columns:1fr; }
        .elite-books-sidebar { display:block; }
        .elite-lines-grid { gap:10px; }
        .elite-history-hero { align-items:start;flex-direction:column; }
        .elite-badge-gallery > div:last-child { grid-template-columns:1fr 1fr; }
        .coach-elite-books-card > div:nth-child(2) { grid-template-columns:1fr; }
        .elite-myteam-hero { grid-template-columns:86px minmax(0,1fr);padding:18px; }
        .elite-myteam-hero > button { grid-column:1/-1; }
        .elite-manager-markets > div { grid-template-columns:1fr; }
        .elite-matchup-locks > div { grid-template-columns:1fr 24px 1fr; } .elite-matchup-locks > div > em,.elite-matchup-locks > div > .elite-matchup-actions { grid-column:1/-1; } .elite-matchup-locks > div > em { text-align:center; }
        .elite-seed-grid { grid-template-columns:1fr 1fr; }
        .elite-commissioner-access { align-items:flex-start;flex-direction:column; }
        .league-login-card { grid-template-columns:1fr;text-align:center; }.league-login-mark { margin:auto; }.league-login-actions,.league-login-error { grid-column:1;justify-content:center; }.network-layout { grid-template-columns:1fr; }.network-sidebar { border-right:0;border-bottom:1px solid rgba(148,163,184,.15); }.network-sidebar > nav { grid-template-columns:repeat(4,1fr); }.network-channel-list,.network-conversation-list { grid-template-columns:repeat(2,1fr); }.network-stage { min-height:620px; }.redzone-multiview { grid-template-columns:1fr; }.redzone-stream-grid { grid-template-columns:1fr; }.redzone-profile-form { grid-template-columns:1fr; }.redzone-profile-form small { grid-column:1; }.network-setting-grid { grid-template-columns:1fr; }
      }
      @media (max-width:520px) {
        .elite-ticker { grid-template-columns:82px minmax(0,1fr); }
        .elite-ticker-label { padding:9px; } .elite-ticker-label b { font-size:13px; }
        .elite-ticker-game { flex-basis:210px;width:210px;min-width:210px;max-width:210px;padding:8px 9px;gap:5px; }
        .elite-books-home { grid-template-columns:1fr; } .elite-books-home-brand { grid-column:auto; }
        .elite-books-home > div { border-right:0;border-bottom:1px solid rgba(255,255,255,.08); }
        .elite-section-head { align-items:start;flex-direction:column; } .elite-section-head > small { text-align:left; }
        .elite-books-main,.elite-books-sidebar,.elite-futures,.elite-history-table,.elite-champions,.elite-badge-gallery,.coach-elite-books-card { padding:13px;border-radius:14px; }
        .elite-line-matchup { grid-template-columns:1fr 28px 1fr; }
        .elite-line-matchup img { max-width:58px!important;max-height:58px!important; }
        .elite-market { grid-template-columns:58px 1fr 1fr;gap:4px;padding:5px 7px; }
        .elite-pick-button { padding:7px 5px;grid-template-columns:1fr; } .elite-pick-button b,.elite-pick-button em,.elite-pick-button small { text-align:center; }
        .elite-ticket-submit { grid-template-columns:1fr; margin:6px 7px 9px; }
        .elite-ticket-submit button { width:100%; min-height:44px; }
        .elite-books-scorebar > div { padding:10px; }
        .elite-badge-gallery > div:last-child { grid-template-columns:1fr; }
        .elite-myteam-login { margin:10px;padding:25px 18px; }
        .elite-seed-grid { grid-template-columns:1fr; }
        .league-login-shell { padding:10px; }.league-login-card { padding:25px 18px;border-radius:18px; }.league-login-mark { width:150px;height:150px; }.league-login-mark strong { font-size:36px; }.league-login-mark b { font-size:34px; }.league-login-card footer { align-items:center;flex-direction:column;gap:7px; }.network-hero,.redzone-hero { align-items:flex-start;flex-direction:column;padding:22px; }.network-live-presence,.redzone-hero > div:last-child { min-width:0; }.network-channel-list,.network-conversation-list { grid-template-columns:1fr; }.network-stage-header { align-items:flex-start;flex-direction:column; }.network-composer { grid-template-columns:1fr; }.network-composer button { min-height:44px; }.network-settings > section { align-items:flex-start;flex-direction:column; }.redzone-directory > header { align-items:flex-start;flex-direction:column; }
        .network-home-panel { grid-template-columns:1fr; }.network-home-panel > button:first-child { grid-column:1; }.network-home-panel > button { border-right:0;border-bottom:1px solid rgba(255,255,255,.08); }.network-home-panel h2 { white-space:normal; }
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
function TabBar({ tabs, activeTab, setActiveTab, draggedTab, setDraggedTab, reorderTabs, adminUnlocked, adminCodeInput, setAdminCodeInput, unlockAdmin, teams = [], assignments = [], currentYear, users: navUsers = [], discordSession, linkedDiscordUser, signInWithDiscord, signOutDiscord,soundPreferences={}}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const groups = [
    { title: "League", keys: ["dashboard", "leagueHub", "schedule", "redZone", "myTeam"] },
    { title: "Elite Books", keys: ["eliteBooks", "sportsbookHistory"] },
    { title: "Rankings", keys: ["eloRankings", "powerIndex", "conferencePower", "recruitingRankings"] },
    { title: "Teams", keys: ["allTeamsRatings"] },
    { title: "Dynasty Legacy", keys: ["dynastyTimeline", "dynastyRecords", "rivalries", "h2h"] },
    { title: "League History", keys: ["coachHOF", "playerHOF"] },
    { title: "Recognition", keys: ["allAmericans", "awards", "heismans", "nationalChampions"] },
    { title: "Commissioner Tools", keys: ["commissionerCenter", "sportsbookManager", "weeklyMatchups", "userManager", "assignments", "leagueDataCenter", "resultsManager", "logoManager"] },
  ];

  const tabMap = new Map(tabs);
  const hiddenWhenLocked = new Set(["commissionerCenter", "sportsbookManager", "weeklyMatchups", "userManager", "assignments", "leagueDataCenter", "resultsManager", "logoManager"]);
  const visibleGroups = groups.map((group) => ({ ...group, keys: group.keys.filter((key) => adminUnlocked || !hiddenWhenLocked.has(key)) })).filter((group) => group.keys.length > 0);
  const usedKeys = new Set(visibleGroups.flatMap((group) => group.keys));
  const coachTabs = tabs
    .filter(([key]) => key.startsWith("coach-"))
    .sort(([aKey, aLabel], [bKey, bLabel]) => {
      const aTeam = teamForCoachTab(aKey)?.name || "ZZZZZ";
      const bTeam = teamForCoachTab(bKey)?.name || "ZZZZZ";
      return aTeam.localeCompare(bTeam, undefined, { sensitivity:"base" })
        || String(aLabel || "").localeCompare(String(bLabel || ""), undefined, { sensitivity:"base" });
    });
  const otherTabs = tabs.filter(([key]) => !usedKeys.has(key) && !key.startsWith("coach-"));

  function handleSelect(key) {
    if((key.startsWith("coach-")||key.startsWith("team-"))&&soundPreferences.team_sounds)playEliteSound("team",true);
    else if(soundPreferences.menu_sounds)playEliteSound("menu",true);
    setActiveTab(key);
    setMenuOpen(false);
  }

  function navThemeFor(tabKey) {
    const main = ["#20114f", "#facc15", "#ffffff"];
    const data = ["#10203f", "#60a5fa", "#ffffff"];
    const legacy = ["#1e163b", "#d4af37", "#ffffff"];
    const ranking = ["#0f172a", "#22d3ee", "#ffffff"];
    const history = ["#111827", "#c4b5fd", "#ffffff"];
    const recognition = ["#141128", "#c4b5fd", "#ffffff"];
    const admin = ["#2a123f", "#f97316", "#ffffff"];

    if (["dashboard", "schedule", "myTeam", "draftRoom"].includes(tabKey)) return main;
    if (tabKey==="leagueHub") return ["#071521", "#38bdf8", "#ffffff"];
    if (tabKey==="redZone") return ["#210608", "#ef4444", "#ffffff"];
    if (["eliteBooks", "sportsbookHistory"].includes(tabKey)) return ["#07110d", "#35d07f", "#ffffff"];
    if (["logoManager", "allTeamsRatings", "leagueDataCenter", "recruitingRankings", "resultsManager"].includes(tabKey)) return data;
    if (["dynastyTimeline", "dynastyRecords", "rivalries", "h2h"].includes(tabKey)) return legacy;
    if (["powerIndex", "eloRankings", "conferencePower"].includes(tabKey)) return ranking;
    if (["coachHOF", "playerHOF"].includes(tabKey)) return history;
    if (["allAmericans", "awards", "heismans", "nationalChampions"].includes(tabKey)) return recognition;
    if (["commissionerCenter", "sportsbookManager", "assignments", "weeklyMatchups", "userManager", "leagueDataCenter", "resultsManager", "logoManager"].includes(tabKey)) return admin;
    return main;
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
      assignments.find((row) => String(row.discord_user_id) === String(userId) && assignmentActiveForYear(row, currentYear)) ||
      assignments.find((row) => String(row.discord_user_id) === String(userId) && row.status === "Active") ||
      assignments.find((row) => String(row.discord_user_id) === String(userId) && row.team_id);
    return teams.find((team) => String(team.id) === String(assignment?.team_id));
  }

  function userForCoachTab(tabKey) {
    const userId = tabKey.replace("coach-", "");
    return (navUsers || []).find((user) => String(user.id) === String(userId));
  }

  function CoachNavButton({ tabKey, label }) {
    const team = teamForCoachTab(tabKey);
    const user = userForCoachTab(tabKey);
    const teamName = team?.name || label || "No active team";
    const userName = user?.discord_username || label || "Coach";
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
        <span className="coach-menu-logo-plate-v86" style={coachMenuLogoPlateV86}>
          <TeamLogoMark team={team} size={68} plate/>
        </span>
        <span style={coachNavTextWrapV86}>
          <strong style={coachNavTeamNameV83}>{teamName}</strong>
          <small style={coachNavUserNameV83}>{userName}</small>
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

      <nav className="cfb-mobile-nav-v2" style={v2MobileNav} aria-label="Primary mobile navigation">
        {[["dashboard","Home","H"],["leagueHub","Hub","#"],["schedule","Games","G"],["eliteBooks","Books","$"],["redZone","RedZone","RZ"]].map(([key,label,icon])=><button key={key} type="button" style={activeTab===key?v2MobileNavActive:v2MobileNavButton} onClick={()=>handleSelect(key)}><b>{icon}</b><span>{label}</span></button>)}
        <button type="button" style={v2MobileNavButton} onClick={()=>setMenuOpen(true)}><b>☰</b><span>More</span></button>
      </nav>

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

            <div className="elite-discord-drawer">
              <div><span>DISCORD IDENTITY</span><strong>{discordSession?(linkedDiscordUser?.discord_username||discordSession.user?.user_metadata?.user_name||"Connected"):"Not connected"}</strong></div>
              <button type="button" onClick={discordSession?signOutDiscord:signInWithDiscord}>{discordSession?"Sign out":"Connect Discord"}</button>
            </div>

            {adminUnlocked&&<div style={drawerAdminBox}><div style={drawerGroupTitle}>Verified Role</div><div style={adminUnlockedPill}>Commissioner</div></div>}

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
              <TeamLogoMark team={row.team} size={66} plate/>
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


function ResultsManager({ rows = [], teams = [], users = [], assignments = [], updateRow = async()=>{}, deleteRow = async()=>{} }) {
  const [query, setQuery] = useState("");
  const filtered = (rows || []).filter((row)=>{
    const haystack = [
      row.week,
      row.season_year,
      row.team_1?.name,
      row.team_2?.name,
      row.user_1?.discord_username,
      row.user_2?.discord_username,
      ...(Array.isArray(row.tags) ? row.tags : []),
    ].join(" ").toLowerCase();
    return !query || haystack.includes(query.toLowerCase());
  });

  return (
    <section style={broadcastCard} className="cfb-results-manager cfb-scroll-card">
      <div style={sectionTop}>
        <div>
          <h2 style={sectionTitle}>Results Manager</h2>
          <p style={mutedText}>Review, search, and delete recorded results. Use League Data Center to enter new games.</p>
        </div>
        <SearchBox value={query} onChange={setQuery}/>
      </div>
      <div className="cfb-table-scroll" style={tableScrollWrapV68}>
        <table style={wideManagerTableV68}>
          <thead>
            <tr>
              <th>Year</th>
              <th>Week</th>
              <th>Team 1</th>
              <th>User 1</th>
              <th>Score</th>
              <th>Team 2</th>
              <th>User 2</th>
              <th>Tags</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length ? filtered.map((row)=>(
              <tr key={row.id}>
                <td>{row.season_year}</td>
                <td>{row.week}</td>
                <td><TeamBroadcastMark team={row.team_1 || teams.find((team)=>team.id===row.team_1_id)} size={30}/></td>
                <td>{row.user_1?.discord_username || users.find((u)=>u.id===row.team_1_user_id)?.discord_username || "CPU"}</td>
                <td><b>{row.team_1_score}-{row.team_2_score}</b></td>
                <td><TeamBroadcastMark team={row.team_2 || teams.find((team)=>team.id===row.team_2_id)} size={30}/></td>
                <td>{row.user_2?.discord_username || users.find((u)=>u.id===row.team_2_user_id)?.discord_username || "CPU"}</td>
                <td>{Array.isArray(row.tags) ? row.tags.join(", ") : row.tags || "—"}</td>
                <td><DeleteButton onClick={()=>deleteRow("game_results", row.id)}/></td>
              </tr>
            )) : (
              <tr><td colSpan={9} style={td}>No results recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
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
function TrophyGalleryV2({title,eyebrow,rows=[],teams=[],users=[],champions=false}) {
  return <main className="cfb-v2-page" style={v2Page}><div style={v2PageHero}><div><span style={v2Eyebrow}>{eyebrow}</span><h1 style={v2PageTitle}>{title}</h1><p style={v2PageSub}>Official CFBElite league history, presented from the live dynasty database.</p></div></div><section style={v2Panel}><div style={recognitionGrid}>{rows.length?rows.map((row)=>{
    const team=teams.find((item)=>String(item.id)===String(row.team_id)); const user=users.find((item)=>String(item.id)===String(row.discord_user_id));
    return <article key={row.id} style={{...recognitionCard,background:`linear-gradient(145deg,${getTeamPrimary(team)}aa,rgba(2,6,23,.98))`,borderColor:`${getTeamSecondary(team)}55`}}><div style={recognitionHeader}><div><div style={recognitionKicker}>{row.season_year}</div><div style={recognitionPlayer}>{champions?(team?.name||"National Champion"):(row.player_name||"Heisman Winner")}</div><div style={recognitionMeta}>{champions?(user?.discord_username||row.discord_users?.discord_username||"Coach TBD"):`${row.position||"Player"} • ${team?.name||"Team"}`}</div></div><TeamLogoMark team={team} size={74} plate/></div></article>;
  }):<div style={v2Empty}>No {title.toLowerCase()} have been recorded yet.</div>}</div></section></main>;
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
function Table({ headers, children }) { return <div className="cfb-table-scroll" style={{overflowX:"auto",WebkitOverflowScrolling:"touch",marginTop:20,width:"100%",maxWidth:"100%"}}><table style={table}><thead><tr>{headers.map((h, index)=><th key={typeof h === "string" ? h : index} style={th}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
function DeleteButton({ onClick }) { return <button onClick={onClick} style={deleteButton}>Delete</button>; }

const page = {
  minHeight:"100vh",
  width:"100%",
  background:"transparent",
  color:"#f8fafc",
  overflowX:"hidden",
  fontFamily:"Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
};
const container={width:"100%",maxWidth:"1680px",margin:"0 auto",padding:"clamp(14px, 2vw, 28px)",boxSizing:"border-box"};
const header={display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:20,background:"radial-gradient(circle at 85% 0%,rgba(220,38,38,.16),transparent 34%),linear-gradient(120deg,#05070c,#111827 66%,#080b12)",border:"1px solid rgba(255,255,255,.13)",borderTop:"4px solid #dc2626",borderRadius:10,padding:"clamp(14px, 2vw, 24px)",boxShadow:"0 22px 60px rgba(0,0,0,.38)"};
const brandWrap={display:"flex",flexDirection:"column",alignItems:"flex-start",gap:8,minWidth:0};
const headerLogo={width:"clamp(170px, 28vw, 340px)",height:"auto",display:"block",objectFit:"contain",filter:"drop-shadow(0 16px 32px rgba(0,0,0,.45))"};
const title={fontSize:"clamp(34px, 5vw, 64px)",fontWeight:1000,margin:0,color:"#fff",letterSpacing:"-.055em",textShadow:"0 12px 32px rgba(0,0,0,.4)"};
const subtitle={marginTop:8,color:"#a8b3c4",fontSize:15};
const statusBox={background:"linear-gradient(135deg,#dc2626,#991b1b)",border:"1px solid rgba(248,113,113,.65)",padding:"11px 17px",borderRadius:7,fontWeight:1000,color:"#fff",cursor:"pointer",boxShadow:"0 12px 28px rgba(220,38,38,.20)",textTransform:"uppercase",letterSpacing:".04em"};
const tabScroller={overflowX:"auto",background:"rgba(5,7,12,.94)",border:"1px solid rgba(255,255,255,.12)",borderTop:"3px solid #dc2626",borderRadius:9,padding:8,marginBottom:18,position:"sticky",top:0,zIndex:10,backdropFilter:"blur(16px)",boxShadow:"0 12px 34px rgba(0,0,0,.3)"};
const tabRow={display:"flex",gap:8,width:"max-content"};
const tabStyle={background:"rgba(255,255,255,.035)",color:"#a8b3c4",border:"1px solid rgba(255,255,255,.08)",borderRadius:6,padding:"10px 14px",fontWeight:900,cursor:"pointer",whiteSpace:"nowrap"};
const activeTabStyle={...tabStyle,background:"linear-gradient(135deg,#dc2626,#991b1b)",border:"1px solid #ef4444",color:"#fff",boxShadow:"0 8px 22px rgba(220,38,38,.18)"};
const statsGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:20,marginBottom:32};
const statCard={background:"linear-gradient(155deg,rgba(14,19,30,.985),rgba(4,7,13,.995))",border:"1px solid rgba(255,255,255,.11)",borderTop:"3px solid #dc2626",borderRadius:9,padding:"clamp(16px, 2vw, 22px)",boxShadow:"0 16px 42px rgba(0,0,0,.3),inset 0 1px rgba(255,255,255,.04)",minHeight:112};
const statTitle={color:"#94a3b8",fontSize:11,marginBottom:10,textTransform:"uppercase",letterSpacing:".11em",fontWeight:1000};
const statValue={fontSize:38,fontWeight:1000,color:"#fff"};
const statInput={...statValue,background:"transparent",color:"white",border:"none",outline:"none",width:"100%"};
const statSelect={background:"#111827",color:"#fff7ed",border:"1px solid rgba(250,204,21,.25)",borderRadius:12,padding:14,fontSize:24,fontWeight:900,width:"100%"};
const card = {
  background:"linear-gradient(155deg,rgba(14,19,30,.985),rgba(4,7,13,.995))",
  border:"1px solid rgba(255,255,255,.11)",
  borderTop:"3px solid #dc2626",
  borderRadius:10,
  padding:"clamp(16px, 2vw, 24px)",
  marginBottom:22,
  boxShadow:"0 22px 70px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.035)"
};
const sectionTop={display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,flexWrap:"wrap"};
const sectionTitle={fontSize:"clamp(22px, 2vw, 30px)",fontWeight:1000,margin:0,color:"#fff",letterSpacing:"-.045em"};
const formGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:16,marginTop:20};
const input = {
  background: "#070b12",
  border: "1px solid rgba(148,163,184,.28)",
  color: "#fff",
  padding: 12,
  borderRadius: 8,
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
  outline: "none",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.045)",
};
const smallInput={...input,width:"120px",marginRight:8};
const searchInput={...input,maxWidth:320};
const button = {
  background: "linear-gradient(135deg,#dc2626,#991b1b)",
  color: "#fff",
  border: "1px solid rgba(248,113,113,.38)",
  borderRadius: 7,
  padding: 12,
  fontWeight: 950,
  cursor: "pointer",
  boxShadow: "0 12px 28px rgba(220,38,38,.18)",
  textTransform:"uppercase",
  letterSpacing:".035em",
};
const sortButton={background:"transparent",border:"none",color:"#facc15",fontSize:12,textTransform:"uppercase",fontWeight:1000,cursor:"pointer",padding:0};
const deleteButton={background:"#7f1d1d",color:"white",border:"1px solid #ef4444",borderRadius:10,padding:"8px 10px",cursor:"pointer"};
const table={width:"100%",borderCollapse:"separate",borderSpacing:0,minWidth:820};
const th={textAlign:"left",padding:"13px 10px",color:"#94a3b8",fontSize:10,textTransform:"uppercase",borderBottom:"2px solid #dc2626",letterSpacing:".09em",fontWeight:1000,background:"#070a10"};
const trStyle={borderBottom:"1px solid rgba(255,255,255,.08)"};
const td={padding:"16px 10px",color:"inherit",verticalAlign:"middle"};
const teamCell={...td,color:"#fff",fontWeight:900};
const clickableTeamCell={...teamCell,cursor:"pointer",textDecoration:"underline"};
const mutedText={color:"#d6d3d1",marginTop:8,marginBottom:0};

const bracketGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(260px, 1fr))",gap:16,marginTop:20};
const gameCard={display:"grid",gap:10,border:"1px solid rgba(255,255,255,.1)",borderRadius:16,padding:14,background:"rgba(7,7,12,.75)",marginBottom:14};
const twoCol={display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(320px, 1fr))",gap:20,marginTop:24};
const twoColWide={display:"grid",gridTemplateColumns:"minmax(0, 3fr) minmax(280px, 1fr)",gap:20,marginTop:20};
const miniCard = {
  background:"linear-gradient(155deg,rgba(14,19,30,.96),rgba(4,7,13,.99))",
  border:"1px solid rgba(255,255,255,.10)",
  borderRadius:9,
  padding:18,
  overflowX:"auto",
  WebkitOverflowScrolling:"touch",
  maxWidth:"100%",
};
const miniRow={borderBottom:"1px solid rgba(255,255,255,.08)",padding:"10px 0",color:"#e4e4e7"};
const miniTitle={marginTop:0,color:"#fff",fontWeight:1000,letterSpacing:"-.03em"};
const recognitionGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(min(100%, 360px), 1fr))",gap:18,marginTop:22};
const recognitionCard={background:"linear-gradient(155deg,rgba(14,19,30,.97),rgba(4,7,13,.99))",border:"1px solid rgba(255,255,255,.11)",borderTop:"3px solid #dc2626",borderRadius:10,padding:18,boxShadow:"0 16px 42px rgba(0,0,0,.3)",overflow:"hidden"};
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
const profileCard={...card,background:"radial-gradient(circle at 90% 0%,rgba(220,38,38,.14),transparent 32%),linear-gradient(135deg,#0d131e,#05070c)"};
const profileHero={display:"flex",alignItems:"center",justifyContent:"space-between",gap:20,flexWrap:"wrap",marginBottom:20};
const eyebrow={color:"#facc15",textTransform:"uppercase",letterSpacing:".12em",fontSize:12,fontWeight:950};
const profileName={fontSize:"clamp(36px, 5vw, 64px)",margin:"6px 0",fontWeight:950,letterSpacing:"-.05em"};
const hofCard={background:"radial-gradient(circle at 90% 0%,rgba(250,204,21,.11),transparent 30%),linear-gradient(145deg,#111827,#05070c 68%,#160809)",border:"1px solid rgba(250,204,21,.26)",borderTop:"3px solid #facc15",borderRadius:12,padding:24,boxShadow:"0 22px 60px rgba(0,0,0,.38)",minHeight:260,overflow:"hidden"};
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
  minHeight: 210,
  borderRadius: 22,
  overflow: "hidden",
  border: "1px solid rgba(255,199,44,.45)",
  marginBottom: 14,
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
  gap: 5,
  position: "relative",
  zIndex: 2,
};

const coachNavName = {
  fontSize: "clamp(18px, 5vw, 26px)",
  lineHeight: 1.02,
  color: "#fff",
  overflowWrap: "anywhere",
  textShadow: "0 2px 14px rgba(0,0,0,.45)",
};

const coachNavTeam = {
  color: "rgba(255,255,255,.86)",
  fontSize: 13,
  fontWeight: 900,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  textShadow: "0 2px 10px rgba(0,0,0,.35)",
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
  background: "linear-gradient(155deg,rgba(14,19,30,.97),rgba(4,7,13,.99))",
  backdropFilter: "blur(20px) saturate(135%)",
  WebkitBackdropFilter: "blur(20px) saturate(135%)",
  border: "1px solid rgba(255,255,255,.11)",
  borderTop: "3px solid #dc2626",
  borderRadius: 10,
  padding: 24,
  boxShadow: "0 20px 56px rgba(0,0,0,.36),inset 0 1px rgba(255,255,255,.045)",
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
    const nextPickNumber = Number(pickNumber) + 1;

    const { data: freshPick, error: freshPickError } = await supabase
      .from("cfb27_draft_picks")
      .select("*, teams(*), discord_users(discord_username)")
      .eq("pick_number", Number(pickNumber))
      .single();

    if (freshPickError) {
      setError(`Draft reveal failed before Discord lookup: ${freshPickError.message}`);
      return;
    }

    const selectedTeam = freshPick?.teams || teamOptions.find((team)=>String(team.id) === String(freshPick?.team_id)) || null;

    const { data: freshNextPick } = await supabase
      .from("cfb27_draft_picks")
      .select("*, discord_users(discord_username)")
      .eq("pick_number", nextPickNumber)
      .maybeSingle();

    const { error: revealError } = await supabase
      .from("cfb27_draft_picks")
      .update({ status: "picked" })
      .eq("pick_number", Number(pickNumber));

    const { error: settingsError } = await supabase
      .from("cfb27_draft_settings")
      .upsert({ id: 1, current_pick: nextPickNumber, is_live: true, updated_at: now }, { onConflict: "id" });

    if (revealError || settingsError) {
      setError(`Draft reveal failed: ${(revealError || settingsError).message}`);
      return;
    }

    await supabase
      .from("cfb27_draft_picks")
      .update({ timer_started_at: now, timer_minutes: draftSettings27.timer_minutes || 10, status: "on_clock" })
      .eq("pick_number", nextPickNumber);

    if (!selectedTeam) {
      setError(`Pick #${pickNumber} was revealed, but Discord was skipped because no team is attached to that pick. Click Pick Is In first, wait for the staged pick to show, then Reveal.`);
      await loadData();
      return;
    }

    const discordBody = {
      pick: {
        pick_number: freshPick.pick_number,
        discord_username: freshPick.discord_username || freshPick.discord_users?.discord_username || "User TBD",
      },
      team: {
        name: selectedTeam.name,
        abbreviation: getTeamAbbreviation(selectedTeam),
        conference: cleanConference(selectedTeam.conference),
        logo_url: selectedTeam.logo_url || "",
        primary_color: getTeamPrimary(selectedTeam),
        secondary_color: getTeamSecondary(selectedTeam),
        draft_prestige: selectedTeam.draft_prestige ?? selectedTeam.school_prestige ?? selectedTeam.prestige_grade ?? "",
        draft_overall: selectedTeam.draft_overall ?? selectedTeam.overall_rating ?? selectedTeam.ovr ?? "",
        draft_offense: selectedTeam.draft_offense ?? selectedTeam.offense_rating ?? selectedTeam.off ?? "",
        draft_defense: selectedTeam.draft_defense ?? selectedTeam.defense_rating ?? selectedTeam.def ?? "",
        board_score: draftTeamRating(selectedTeam),
      },
      next_pick: freshNextPick ? {
        pick_number: freshNextPick.pick_number,
        discord_username: freshNextPick.discord_username || freshNextPick.discord_users?.discord_username || "User TBD",
      } : null,
    };

    console.log("Calling discord-draft-pick function", discordBody);

    const { data: discordData, error: discordError } = await supabase.functions.invoke("discord-draft-pick", {
      body: discordBody,
    });

    if (discordError) {
      console.error("Discord draft function failed", discordError);
      setError(`Pick revealed, but Discord announcement failed: ${discordError.message || JSON.stringify(discordError)}`);
      await loadData();
      return;
    }

    console.log("Discord draft function response", discordData);
    setError("Pick revealed, Discord notified, and next user is now on the clock.");
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
  right: 16,
  top: "50%",
  transform: "translateY(-50%)",
  width: 96,
  height: 96,
  objectFit: "contain",
  objectPosition: "center center",
  opacity: .20,
  pointerEvents: "none",
  zIndex: 0,
  filter: "drop-shadow(0 0 18px rgba(255,255,255,.16))",
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
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 310px), 1fr))",
  gap: 16,
  marginTop: 18,
};

const logoManagerCard = {
  ...liquidGlassTile,
  display: "grid",
  gap: 10,
  minWidth: 0,
  overflow: "hidden",
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
  border: "1px solid rgba(255,255,255,.12)",
  borderTop: "3px solid #dc2626",
  borderRadius: 9,
  background: "linear-gradient(90deg,rgba(5,7,12,.97),rgba(15,21,33,.94))",
  backdropFilter: "blur(16px)",
  boxShadow: "0 18px 60px rgba(0,0,0,.30)",
};

const hamburgerButton = {
  border: "1px solid rgba(248,113,113,.46)",
  background: "linear-gradient(135deg,#dc2626,#991b1b)",
  color: "#fff",
  borderRadius: 7,
  padding: "12px 16px",
  fontWeight: 1000,
  cursor: "pointer",
  boxShadow: "0 12px 28px rgba(220,38,38,.22)",
  textTransform:"uppercase",
  letterSpacing:".04em",
};

const activePagePill = {
  border: "1px solid rgba(148,163,184,.24)",
  background: "rgba(5,7,12,.82)",
  color: "#e5e7eb",
  borderRadius: 7,
  padding: "10px 14px",
  fontWeight: 900,
  fontSize: 13,
};

const drawerPanel = {
  width: "min(420px, 92vw)",
  height: "100%",
  background: "radial-gradient(circle at 0 0,rgba(220,38,38,.17),transparent 27%),linear-gradient(180deg,#080b12,#030509)",
  borderRight: "1px solid rgba(248,113,113,.26)",
  borderTop: "4px solid #dc2626",
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
  minHeight: 112,
  borderRadius: 20,
  padding: "12px 20px 12px 14px",
  display: "flex",
  alignItems: "center",
  gap: 20,
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
  background: "linear-gradient(155deg,rgba(15,21,33,.94),rgba(4,7,13,.98))",
  border: "1px solid rgba(255,255,255,.10)",
  borderRadius: 9,
  padding: 13,
  boxShadow: "0 16px 44px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.05)",
};

const broadcastCard = {
  background:"linear-gradient(155deg,rgba(14,19,30,.97),rgba(4,7,13,.99))",
  border:"1px solid rgba(255,255,255,.11)",
  borderTop:"3px solid #dc2626",
  borderRadius:10,
  padding:"clamp(16px, 2vw, 24px)",
  boxShadow:"0 22px 70px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.035)"
};

const broadcastPageCard = {
  ...card,
  borderRadius: 10,
  background: "linear-gradient(155deg,rgba(14,19,30,.98),rgba(4,7,13,.995))",
  border: "1px solid rgba(255,255,255,.11)",
  borderTop: "3px solid #dc2626",
  boxShadow: "0 20px 58px rgba(0,0,0,.38),inset 0 1px rgba(255,255,255,.045)",
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
  gap: 18,
  minWidth: 0,
  lineHeight: 1,
};

const dashboardTopThreeMini = {
  display: "grid",
  gap: 4,
  marginTop: 4,
};


const dashboardTableHeadPro = {
  display: "grid",
  gridTemplateColumns: "58px minmax(230px,1.25fr) minmax(120px,.7fr) 54px 54px 80px 80px 78px 70px 82px",
  gap: 12,
  alignItems: "center",
  padding: "0 16px 10px",
  color: "#cbd5e1",
  fontSize: 12,
  fontWeight: 1000,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  minWidth: 980,
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
  gridTemplateColumns: "58px minmax(230px,1.25fr) minmax(120px,.7fr) 54px 54px 80px 80px 78px 70px 82px",
  gap: 12,
  alignItems: "center",
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 14,
  padding: "13px 16px",
  color: "#f8fafc",
  textAlign: "left",
  cursor: "pointer",
  minWidth: 980,
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
  WebkitOverflowScrolling: "touch",
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
  animation: "cfbDraftTickerScroll 72s linear infinite",
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
  maxWidth: "100%",
  overflow: "hidden",
  borderRadius: 18,
  border: "1px solid rgba(71,85,105,.70)",
  background: "linear-gradient(145deg, rgba(15,23,42,.97), rgba(2,6,23,.99))",
};

const coachStatsTableWrapV41 = {
  width: "100%",
  maxWidth: "100%",
  overflowX: "auto",
  overflowY: "hidden",
  WebkitOverflowScrolling: "touch",
  touchAction: "pan-x pan-y",
  marginTop: 12,
  paddingBottom: 6,
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
  position: "relative",
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
  gridTemplateColumns: "116px minmax(0,1fr)",
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
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
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
  border: "1px solid rgba(255,255,255,.06)",
  background: "linear-gradient(145deg, rgba(15,23,42,.92), rgba(2,6,23,.98))",
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
  background: "rgba(255,255,255,.035)",
  border: "1px solid rgba(255,255,255,.06)",
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


const draftTickerClockV49 = {
  color: "#d4af37",
  fontWeight: 1000,
};

const draftConferencePicksV49 = {
  display: "grid",
  gap: 6,
  marginTop: 10,
  paddingTop: 10,
  borderTop: "1px solid rgba(255,255,255,.08)",
};

const draftConferencePickRowV49 = {
  display: "grid",
  gridTemplateColumns: "34px 28px minmax(0,1fr) minmax(78px, auto)",
  gap: 6,
  alignItems: "center",
  fontSize: 12,
};

const warRoomListV49 = {
  borderRadius: 14,
  padding: 12,
  background: "rgba(255,255,255,.035)",
  border: "1px solid rgba(255,255,255,.08)",
};

const warRoomTopFiveV49 = {
  display: "grid",
  gap: 6,
};

const warRoomRowV49 = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "34px 34px minmax(0,1fr) auto",
  gap: 8,
  alignItems: "center",
  border: "1px solid rgba(255,255,255,.07)",
  borderRadius: 10,
  padding: "9px 8px",
  color: "#f8fafc",
  background: "rgba(2,6,23,.35)",
  textAlign: "left",
  cursor: "pointer",
};


const coachMenuLogoPlateV51 = {
  width: 90,
  height: 90,
  minWidth: 90,
  borderRadius: 20,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "linear-gradient(180deg, rgba(255,255,255,.13), rgba(255,255,255,.045))",
  border: "1px solid rgba(255,255,255,.18)",
  boxShadow: "0 16px 34px rgba(0,0,0,.30), inset 0 1px 0 rgba(255,255,255,.13)",
  position: "relative",
  zIndex: 2,
  overflow: "visible",
  flexShrink: 0,
};


const teamAssetLogoStageV54 = {
  display: "grid",
  gap: 10,
  justifyItems: "center",
  textAlign: "center",
};

const teamAssetLogoBackdropV54 = {
  width: "100%",
  height: 128,
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 18,
  display: "grid",
  placeItems: "center",
  background: "rgba(255,255,255,.045)",
  color: "rgba(255,255,255,.60)",
  overflow: "hidden",
};

const teamAssetLogoImgV54 = {
  maxWidth: "86%",
  maxHeight: "86%",
  objectFit: "contain",
  objectPosition: "center center",
  display: "block",
};

const assetFieldLabelV54 = {
  display: "grid",
  gap: 6,
  color: "rgba(226,232,240,.82)",
  fontSize: 12,
  fontWeight: 950,
  textTransform: "uppercase",
  letterSpacing: ".08em",
};

const conferenceLogoSectionV54 = {
  marginTop: 28,
  paddingTop: 24,
  borderTop: "1px solid rgba(255,255,255,.08)",
};

const conferenceLogoGridV54 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
  gap: 14,
  marginTop: 16,
};

const conferenceLogoCardV54 = {
  ...liquidGlassTile,
  display: "grid",
  gap: 10,
  justifyItems: "stretch",
  minWidth: 0,
};

const conferenceLogoPreviewV54 = {
  height: 104,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,.10)",
  background: "rgba(255,255,255,.035)",
  display: "grid",
  placeItems: "center",
  overflow: "hidden",
};

const conferenceLogoImgV54 = {
  maxWidth: "82%",
  maxHeight: "82%",
  objectFit: "contain",
  objectPosition: "center center",
};

const conferencePowerNameV54 = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
};


const coachMobileEmptyStateV56 = {
  marginTop: 14,
  padding: "18px",
  borderRadius: 14,
  background: "rgba(255,255,255,.035)",
  border: "1px solid rgba(255,255,255,.07)",
  color: "rgba(226,232,240,.86)",
  display: "grid",
  gap: 6,
  lineHeight: 1.35,
  whiteSpace: "normal",
  overflowWrap: "break-word",
};


const prestigeStarsWrapV57 = {
  display: "inline-flex",
  alignItems: "center",
  gap: 1,
  verticalAlign: "middle",
};

const prestigeStarBoxV57 = {
  position: "relative",
  display: "inline-block",
  lineHeight: 1,
  overflow: "hidden",
  flexShrink: 0,
};

const prestigeStarEmptyV57 = {
  color: "rgba(226,232,240,.36)",
  display: "block",
};

const prestigeStarFillV57 = {
  position: "absolute",
  left: 0,
  top: 0,
  height: "100%",
  overflow: "hidden",
  color: "#d4af37",
  display: "block",
  whiteSpace: "nowrap",
};

const prestigePreviewLineV57 = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  flexWrap: "wrap",
};


const conferenceCapStatusV58 = {
  display: "grid",
  gridTemplateColumns: "auto auto minmax(0, 1fr)",
  gap: 8,
  alignItems: "center",
  padding: "8px 10px",
  borderRadius: 12,
  background: "rgba(255,255,255,.035)",
  border: "1px solid rgba(255,255,255,.06)",
};

const conferenceOpenPillV58 = {
  color: "#bbf7d0",
  fontWeight: 1000,
  fontSize: 12,
};

const conferenceLockedPillV58 = {
  color: "#fecaca",
  fontWeight: 1000,
  fontSize: 12,
};

const allTeamsFilterGridV58 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))",
  gap: 10,
  margin: "16px 0",
};

const allTeamsTableWrapV58 = {
  overflowX: "auto",
  WebkitOverflowScrolling: "touch",
  width: "100%",
};

const allTeamsTableV58 = {
  width: "100%",
  minWidth: 980,
  borderCollapse: "separate",
  borderSpacing: "0 8px",
  color: "#f8fafc",
};

const allTeamsRowV58 = {
  border: "1px solid rgba(255,255,255,.08)",
};

const allTeamsTeamCellV58 = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  minWidth: 0,
};


const conferenceMultiFilterV60 = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  margin: "10px 0 14px",
};

const conferenceFilterPillV60 = {
  border: "1px solid rgba(255,255,255,.12)",
  background: "rgba(15,23,42,.88)",
  color: "#f8fafc",
  borderRadius: 999,
  padding: "9px 12px",
  fontWeight: 950,
  cursor: "pointer",
};

const conferenceFilterPillActiveV60 = {
  border: "1px solid rgba(212,175,55,.72)",
  background: "linear-gradient(135deg, rgba(212,175,55,.30), rgba(15,23,42,.92))",
  color: "#fef3c7",
  borderRadius: 999,
  padding: "9px 12px",
  fontWeight: 1000,
  cursor: "pointer",
  boxShadow: "0 0 18px rgba(212,175,55,.16)",
};


const saveAssetButtonV61 = {
  border: "1px solid rgba(255,255,255,.10)",
  background: "rgba(255,255,255,.045)",
  color: "rgba(226,232,240,.78)",
  borderRadius: 12,
  padding: "11px 12px",
  fontWeight: 1000,
  cursor: "pointer",
};

const saveAssetButtonDirtyV61 = {
  border: "1px solid rgba(212,175,55,.72)",
  background: "linear-gradient(135deg, rgba(212,175,55,.95), rgba(180,83,9,.95))",
  color: "#020617",
  borderRadius: 12,
  padding: "11px 12px",
  fontWeight: 1000,
  cursor: "pointer",
  boxShadow: "0 12px 28px rgba(212,175,55,.18)",
};


const recruitingReadOnlyGridV62 = {
  display: "grid",
  gap: 18,
  marginTop: 18,
};

const recruitingRankingsTableV62 = {
  width: "100%",
  minWidth: 980,
  borderCollapse: "separate",
  borderSpacing: "0 8px",
  color: "#f8fafc",
};


const dashboardFeatureGridV64 = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.15fr) minmax(280px, .75fr) minmax(280px, .85fr)",
  gap: 16,
};

const coachSpotlightCardV64 = {
  ...broadcastCard,
  background: "linear-gradient(135deg, rgba(15,23,42,.98), rgba(2,6,23,.98))",
  border: "1px solid rgba(212,175,55,.22)",
};

const coachSpotlightInnerV64 = {
  display: "grid",
  gridTemplateColumns: "110px minmax(0,1fr)",
  gap: 18,
  alignItems: "center",
  marginTop: 10,
};

const coachSpotlightTextV64 = {
  display: "grid",
  gap: 8,
  minWidth: 0,
};

const coachSpotlightStatsV64 = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const dashboardMiniPanelV64 = {
  ...broadcastCard,
  minHeight: 260,
};

const dashboardMiniListV64 = {
  display: "grid",
  gap: 8,
  marginTop: 10,
};

const dashboardMiniRowV64 = {
  display: "grid",
  gridTemplateColumns: "36px minmax(0,1fr) auto auto",
  gap: 10,
  alignItems: "center",
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,.04)",
  border: "1px solid rgba(255,255,255,.07)",
};

const dashboardResultRowV64 = {
  display: "grid",
  gridTemplateColumns: "70px minmax(0,1fr) minmax(0,1fr)",
  gap: 8,
  alignItems: "center",
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,.04)",
  border: "1px solid rgba(255,255,255,.07)",
};


const teamBroadcastMarkV66 = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  minWidth: 0,
};

const teamBroadcastCompactV66 = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
};

const teamBroadcastTextV66 = {
  display: "grid",
  gap: 2,
  minWidth: 0,
  lineHeight: 1.05,
};

const coachSpotlightTeamLineV66 = {
  color: "#d4af37",
  fontWeight: 1000,
  letterSpacing: ".06em",
  textTransform: "uppercase",
};

const dashboardResultTeamV66 = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
};

const dashboardConferenceTopV66 = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};


const draftConferenceBadgeV68 = {
  position: "absolute",
  right: 10,
  top: 10,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 7px",
  borderRadius: 999,
  background: "rgba(2,6,23,.54)",
  border: "1px solid rgba(255,255,255,.14)",
  color: "rgba(248,250,252,.86)",
  fontWeight: 900,
  fontSize: 10,
  letterSpacing: ".04em",
  textTransform: "uppercase",
};

const draftAvailableTopLineV68 = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
};

const draftConferencePillV68 = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "4px 6px",
  borderRadius: 999,
  background: "rgba(2,6,23,.42)",
  border: "1px solid rgba(255,255,255,.12)",
  fontSize: 10,
  fontWeight: 900,
  color: "rgba(248,250,252,.88)",
};

const tableScrollWrapV68 = {
  overflowX: "auto",
  WebkitOverflowScrolling: "touch",
  maxWidth: "100%",
};

const wideManagerTableV68 = {
  minWidth: 1100,
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  color: "#f8fafc",
};


const draftConferenceBadgeV69 = {
  position: "absolute",
  right: 10,
  top: 10,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  maxWidth: "calc(100% - 68px)",
  padding: "5px 8px",
  borderRadius: 999,
  background: "rgba(2,6,23,.66)",
  border: "1px solid rgba(255,255,255,.16)",
  color: "rgba(248,250,252,.92)",
  fontWeight: 1000,
  fontSize: 10,
  letterSpacing: ".04em",
  textTransform: "uppercase",
  boxShadow: "0 10px 24px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.08)",
  backdropFilter: "blur(10px)",
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
};



const draftConferenceBadgeV70 = {
  position: "absolute",
  right: 10,
  top: 10,
  zIndex: 3,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  maxWidth: "calc(100% - 72px)",
  padding: "5px 8px",
  borderRadius: 999,
  background: "rgba(2,6,23,.72)",
  border: "1px solid rgba(255,255,255,.18)",
  color: "rgba(248,250,252,.94)",
  fontWeight: 1000,
  fontSize: 10,
  letterSpacing: ".05em",
  textTransform: "uppercase",
  boxShadow: "0 10px 24px rgba(0,0,0,.30), inset 0 1px 0 rgba(255,255,255,.08)",
  backdropFilter: "blur(10px)",
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
  pointerEvents: "none",
};



const draftNilPipelineMiniV77 = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 8,
  width: "100%",
  padding: "8px 0",
  borderTop: "1px solid rgba(255,255,255,.12)",
  borderBottom: "1px solid rgba(255,255,255,.10)",
  color: "rgba(248,250,252,.80)",
  fontSize: 11,
  fontWeight: 800,
};

const draftNilCompactLineV77 = {
  display: "block",
  marginTop: 5,
  color: "rgba(248,250,252,.78)",
  fontWeight: 900,
};


const draftAvailableBestGridV79 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
  gap: 12,
  alignItems: "stretch",
};


const draftSortStatusV80 = {
  color: "rgba(226,232,240,.78)",
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: ".04em",
  textTransform: "uppercase",
  margin: "8px 0 12px",
};


const coachNavTeamNameV82 = {
  display: "block",
  fontSize: "clamp(18px, 3.4vw, 27px)",
  lineHeight: .92,
  letterSpacing: "-.045em",
  fontWeight: 1000,
  color: "#fff",
  textShadow: "0 10px 26px rgba(0,0,0,.30)",
  overflowWrap: "anywhere",
};

const coachNavUserNameV82 = {
  display: "block",
  marginTop: 5,
  color: "rgba(248,250,252,.84)",
  fontSize: "clamp(11px, 2.4vw, 13px)",
  lineHeight: 1.05,
  fontWeight: 900,
  overflowWrap: "anywhere",
};


const coachNavTextWrapV83 = {
  position: "relative",
  zIndex: 2,
  minWidth: 0,
  display: "grid",
  gap: 4,
  alignContent: "center",
};

const coachNavTeamNameV83 = {
  display: "block",
  color: "#fff",
  fontSize: "clamp(16px, 3.4vw, 26px)",
  lineHeight: .94,
  letterSpacing: "-.055em",
  fontWeight: 1000,
  overflowWrap: "anywhere",
  textShadow: "0 10px 26px rgba(0,0,0,.35)",
};

const coachNavUserNameV83 = {
  display: "block",
  color: "rgba(248,250,252,.84)",
  fontSize: "clamp(11px, 2.2vw, 13px)",
  lineHeight: 1.05,
  fontWeight: 900,
  overflowWrap: "anywhere",
  textTransform: "none",
};


const coachMenuLogoPlateV86 = {
  position: "relative",
  zIndex: 3,
  width: 88,
  height: 88,
  minWidth: 88,
  minHeight: 88,
  borderRadius: 20,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  background: "linear-gradient(180deg, rgba(255,255,255,.16), rgba(255,255,255,.04))",
  border: "1px solid rgba(255,255,255,.20)",
  boxShadow: "0 14px 30px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.15)",
};

const coachNavTextWrapV86 = {
  position: "relative",
  zIndex: 4,
  minWidth: 0,
  display: "grid",
  gap: 4,
  alignContent: "center",
  overflow: "hidden",
  paddingLeft: 8,
};


const gameCenterPageV87 = { display:"grid", gap:18 };
const gameCenterHeroV87 = { ...liquidGlassPanel, display:"flex", justifyContent:"space-between", alignItems:"center", gap:18, padding:24, background:"radial-gradient(circle at 0 0, rgba(250,204,21,.16), transparent 35%), linear-gradient(135deg, rgba(2,6,23,.98), rgba(15,23,42,.96))" };
const gameCenterTitleV87 = { margin:"4px 0", fontSize:"clamp(42px,8vw,86px)", lineHeight:.88, letterSpacing:"-.07em", fontWeight:1000, color:"#fff" };
const gameCenterHeroStatV87 = { minWidth:150, textAlign:"center", padding:18, borderRadius:18, background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.12)" };
const gameCenterHeroStatV87b = {};
const gameCenterFiltersV87 = { display:"grid", gridTemplateColumns:"180px minmax(220px,1fr) 180px", gap:10 };
const gameCenterFeaturedV87 = { borderRadius:24, border:"1px solid rgba(255,255,255,.16)", padding:20, boxShadow:"0 24px 60px rgba(0,0,0,.32)" };
const gameCenterFeaturedLabelV87 = { textAlign:"center", color:"#facc15", fontWeight:1000, letterSpacing:".12em", fontSize:12 };
const gameCenterFeaturedTeamsV87 = { display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:20, alignItems:"center", marginTop:14 };
const gameCenterVsV87 = { fontWeight:1000, fontSize:18, color:"#f8fafc", textAlign:"center" };
const gameCenterGridV87 = { display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(310px,1fr))", gap:14 };
const gameCenterCardV87 = { borderRadius:20, border:"1px solid rgba(255,255,255,.12)", background:"linear-gradient(145deg,rgba(15,23,42,.96),rgba(2,6,23,.98))", padding:16, boxShadow:"0 16px 38px rgba(0,0,0,.26)" };
const gameCenterCardTopV87 = { display:"flex", justifyContent:"space-between", color:"rgba(226,232,240,.78)", fontSize:11, fontWeight:1000, letterSpacing:".08em" };
const gameCenterMatchupV87 = { display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:10, alignItems:"center", marginTop:14 };
const gameCenterTeamV87 = { display:"grid", justifyItems:"center", gap:6, textAlign:"center", color:"#fff" };
const gameCenterTeamCompactV87 = { display:"grid", justifyItems:"center", gap:4, textAlign:"center", color:"#fff", minWidth:0 };
const gameCenterRankV87 = { color:"#facc15", fontSize:13 };
const gameCenterFinalScoreV87 = { textAlign:"center", marginTop:12, fontSize:22, fontWeight:1000, color:"#fff" };

const dashboardSchedulePanelV87 = { ...liquidGlassPanel, padding:18, display:"grid", gap:14 };
const dashboardGameOfWeekV87 = { border:"1px solid rgba(250,204,21,.28)", borderRadius:20, padding:16, color:"#fff", cursor:"pointer" };
const dashboardGameEyebrowV87 = { textAlign:"center", color:"#facc15", fontWeight:1000, letterSpacing:".12em", fontSize:11 };
const dashboardMatchupRowV87 = { display:"grid", gridTemplateColumns:"1fr auto 1fr", alignItems:"center", gap:12, marginTop:12 };
const dashboardMatchupTeamV87 = { display:"flex", alignItems:"center", justifyContent:"center", gap:8, fontWeight:1000 };
const dashboardScheduleGridV87 = { display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))", gap:10 };
const dashboardScheduleCardV87 = { display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:8, alignItems:"center", padding:10, borderRadius:14, background:"rgba(15,23,42,.78)", border:"1px solid rgba(255,255,255,.10)", color:"#fff", cursor:"pointer" };
const dashboardScheduleSideV87 = { display:"flex", alignItems:"center", gap:5, minWidth:0, fontSize:12, fontWeight:1000 };
const dashboardScheduleLinkV87 = { justifySelf:"end", border:0, background:"transparent", color:"#facc15", fontWeight:1000, cursor:"pointer" };


const gameCenterMetaV89 = { display:"flex", justifyContent:"space-between", gap:8, marginTop:12, color:"rgba(226,232,240,.72)", fontSize:10, fontWeight:900, textTransform:"uppercase", letterSpacing:".05em" };
const gameCenterGotwButtonV89 = { width:"100%", marginTop:12, border:"1px solid rgba(250,204,21,.35)", borderRadius:12, padding:"9px 12px", background:"rgba(250,204,21,.10)", color:"#facc15", fontWeight:1000, cursor:"pointer" };
const dashboardFeatureGridV89 = { display:"grid", gridTemplateColumns:"minmax(300px,.75fr) minmax(0,1.5fr)", gap:16 };
const dashboardConferencePowerWideV89 = { ...liquidGlassPanel, padding:18, minWidth:0 };
const dashboardConferenceHeadV89 = { display:"grid", gridTemplateColumns:"60px 1.3fr 1fr 80px 70px 90px 70px 80px", gap:10, padding:"0 12px 8px", color:"rgba(226,232,240,.58)", fontSize:10, fontWeight:1000, textTransform:"uppercase", letterSpacing:".06em" };
const dashboardConferenceRowsV89 = { display:"grid", gap:8 };
const dashboardConferenceRowV89 = { display:"grid", gridTemplateColumns:"60px 1.3fr 1fr 80px 70px 90px 70px 80px", gap:10, alignItems:"center", padding:"10px 12px", borderRadius:14, border:"1px solid rgba(255,255,255,.10)", color:"#fff", fontSize:12 };
const dashboardSchedulePanelV89 = { ...liquidGlassPanel, padding:18, display:"grid", gap:14 };
const dashboardSeasonWeeksV89 = { display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(310px,1fr))", gap:12 };
const dashboardWeekGroupV89 = { borderRadius:16, padding:12, background:"rgba(15,23,42,.68)", border:"1px solid rgba(255,255,255,.10)" };
const dashboardWeekHeaderV89 = { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10, color:"#fff" };
const dashboardWeekGamesV89 = { display:"grid", gap:8 };
const dashboardScheduleCardV89 = { display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:8, alignItems:"center", padding:9, borderRadius:12, background:"rgba(2,6,23,.72)", border:"1px solid rgba(255,255,255,.08)", color:"#fff", cursor:"pointer" };


const gameCenterControlNoteV90 = {
  padding:"10px 14px",
  borderRadius:12,
  background:"rgba(250,204,21,.08)",
  border:"1px solid rgba(250,204,21,.22)",
  color:"rgba(248,250,252,.90)",
  fontSize:12,
};

const gameCenterConferenceLogosV90 = {
  display:"inline-flex",
  alignItems:"center",
  justifyContent:"center",
  gap:8,
};

const dashboardConferenceLogoCellV90 = {
  display:"flex",
  alignItems:"center",
  justifyContent:"flex-start",
};

const dashboardScheduleSideV90 = {
  display:"grid",
  gridTemplateColumns:"34px 38px minmax(0,1fr)",
  alignItems:"center",
  justifyItems:"center",
  gap:6,
  minWidth:0,
  fontSize:12,
  fontWeight:1000,
};

const gameCenterTeamV90 = {
  display:"grid",
  justifyItems:"center",
  alignContent:"start",
  gap:7,
  textAlign:"center",
  color:"#fff",
  minWidth:0,
};

const gameCenterTeamCompactV90 = {
  display:"grid",
  justifyItems:"center",
  alignContent:"start",
  gap:5,
  textAlign:"center",
  color:"#fff",
  minWidth:0,
};

const gameCenterRankLogoV90 = {
  display:"grid",
  justifyItems:"center",
  alignItems:"center",
  gap:3,
  minHeight:72,
};

const gameCenterRankV90 = {
  color:"#facc15",
  fontSize:13,
  lineHeight:1,
};

const gameCenterTeamNameV90 = {
  display:"block",
  lineHeight:1.05,
  minHeight:"2.1em",
};

const gameCenterUserV90 = {
  color:"rgba(248,250,252,.82)",
  lineHeight:1.05,
};


const gameCenterRankLogoV91 = {
  position:"relative",
  display:"inline-grid",
  placeItems:"center",
  minWidth:64,
  minHeight:64,
};

const gameCenterRankBadgeV91 = {
  position:"absolute",
  top:-4,
  right:-8,
  zIndex:5,
  minWidth:30,
  height:24,
  padding:"0 7px",
  borderRadius:999,
  display:"inline-flex",
  alignItems:"center",
  justifyContent:"center",
  background:"#facc15",
  color:"#111827",
  border:"2px solid rgba(2,6,23,.95)",
  boxShadow:"0 8px 18px rgba(0,0,0,.35)",
  fontSize:11,
  fontWeight:1000,
  lineHeight:1,
};

const dashboardConferenceMobileMetricsV91 = {
  display:"none",
  gridColumn:"1 / -1",
  gridTemplateColumns:"repeat(5,minmax(0,1fr))",
  gap:6,
  marginTop:8,
  paddingTop:8,
  borderTop:"1px solid rgba(255,255,255,.10)",
};

const actionRow = {
  display:"flex",
  alignItems:"center",
  gap:10,
  flexWrap:"wrap",
  marginTop:14,
};

// CFBElite v2 presentation system
const v2Page={display:"grid",gap:16,width:"100%",paddingBottom:24};
const v2PageHero={display:"flex",alignItems:"center",justifyContent:"space-between",gap:22,flexWrap:"wrap",padding:"clamp(20px,3vw,34px)",borderRadius:10,background:"radial-gradient(circle at 88% 0%,rgba(220,38,38,.16),transparent 34%),linear-gradient(118deg,#05070c,#101827 64%,#080b12)",border:"1px solid rgba(255,255,255,.13)",borderTop:"4px solid #dc2626",boxShadow:"0 22px 60px rgba(0,0,0,.34)"};
const v2Eyebrow={display:"block",color:"#facc15",fontSize:11,fontWeight:1000,letterSpacing:".17em",textTransform:"uppercase",marginBottom:8};
const v2PageTitle={margin:0,fontSize:"clamp(40px,5.4vw,72px)",lineHeight:.96,letterSpacing:"-.055em",fontWeight:1000,color:"#fff"};
const v2DashboardTitle={...v2PageTitle,fontSize:"clamp(38px,5vw,66px)",maxWidth:760};
const v2PageSub={margin:"10px 0 0",color:"#cbd5e1",fontSize:"clamp(13px,1.5vw,16px)",lineHeight:1.55,maxWidth:760};
const v2Panel={background:"linear-gradient(155deg,rgba(14,19,30,.985),rgba(4,7,13,.995))",border:"1px solid rgba(255,255,255,.11)",borderRadius:10,padding:"clamp(16px,2.2vw,26px)",boxShadow:"0 16px 42px rgba(0,0,0,.28)",minWidth:0,overflow:"hidden"};
const v2PanelHeader={display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16,flexWrap:"wrap",marginBottom:18};
const v2PrimaryButton={border:"1px solid #ef4444",borderRadius:5,padding:"11px 15px",background:"linear-gradient(135deg,#dc2626,#991b1b)",color:"#fff",fontWeight:1000,cursor:"pointer",boxShadow:"0 10px 24px rgba(220,38,38,.16)",textTransform:"uppercase",letterSpacing:".04em"};
const v2GhostButton={border:"1px solid rgba(148,163,184,.32)",borderRadius:11,padding:"10px 14px",background:"rgba(15,23,42,.78)",color:"#f8fafc",fontWeight:900,cursor:"pointer"};
const v2TextButton={border:0,background:"transparent",color:"#facc15",fontWeight:900,cursor:"pointer",padding:4};
const v2DangerSoft={border:"1px solid rgba(248,113,113,.30)",borderRadius:11,padding:"10px 13px",background:"rgba(127,29,29,.22)",color:"#fecaca",fontWeight:900,cursor:"pointer"};
const v2DangerButton={...v2DangerSoft,background:"#b91c1c",borderColor:"#fca5a5",color:"#fff"};
const v2Input={background:"rgba(2,6,23,.88)",border:"1px solid rgba(148,163,184,.32)",color:"#fff",borderRadius:11,padding:"11px 12px",minHeight:44,minWidth:0,maxWidth:"100%"};
const v2Textarea={...v2Input,width:"100%",minHeight:180,resize:"vertical",marginTop:16,lineHeight:1.55};
const v2InlineActions={display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"};
const v2InlineForm={display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"};
const v2FormGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:12};
const v2FieldLabel={display:"grid",gap:8,color:"#cbd5e1",fontSize:12,fontWeight:900,textTransform:"uppercase",letterSpacing:".08em"};
const v2Notice={padding:"12px 15px",borderRadius:12,background:"rgba(30,64,175,.20)",border:"1px solid rgba(96,165,250,.30)",color:"#dbeafe",fontWeight:800};
const v2Empty={padding:"28px 18px",border:"1px dashed rgba(148,163,184,.28)",borderRadius:14,color:"#94a3b8",textAlign:"center",gridColumn:"1/-1"};
const v2SuccessState={...v2Empty,color:"#86efac",borderColor:"rgba(74,222,128,.26)",background:"rgba(22,101,52,.10)"};

const v2DashboardHero={...v2PageHero,display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(250px,auto)",alignItems:"end"};
const v2AdvanceCard={display:"grid",gap:4,padding:"16px 18px",borderRadius:16,background:"rgba(2,6,23,.55)",border:"1px solid rgba(250,204,21,.18)",minWidth:250};
const v2HeroControls={gridColumn:"1/-1",display:"flex",gap:10,flexWrap:"wrap",paddingTop:14,borderTop:"1px solid rgba(255,255,255,.08)"};
const v2KpiGrid={display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:14};
const v2Kpi={display:"grid",gap:5,padding:"17px 18px",borderRadius:16,background:"rgba(15,23,42,.94)",border:"1px solid rgba(148,163,184,.14)",borderTop:"3px solid #60a5fa",boxShadow:"0 14px 34px rgba(0,0,0,.20)"};
const v2LeaderGrid={display:"grid",gridTemplateColumns:"repeat(5,minmax(0,1fr))",gap:10};
const v2LeaderTile={display:"grid",alignContent:"start",minWidth:0,background:"linear-gradient(165deg,#111827,#070a10)",border:"1px solid rgba(255,255,255,.12)",borderTop:"3px solid #dc2626",borderRadius:8,boxShadow:"0 16px 38px rgba(0,0,0,.25)",overflow:"hidden"};
const v2LeaderHeader={display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"12px 13px",borderBottom:"1px solid rgba(255,255,255,.10)",color:"#f8fafc",fontSize:11,fontWeight:1000,textTransform:"uppercase",letterSpacing:".065em"};
const v2LeaderRows={display:"grid",padding:"5px 10px 9px"};
const v2LeaderRow={display:"grid",gridTemplateColumns:"18px 30px minmax(0,1fr) auto",alignItems:"center",gap:7,minWidth:0,padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,.07)"};
const v2LeaderLogo={width:30,height:30,display:"grid",placeItems:"center",overflow:"hidden"};
const v2LeaderMonogram={width:27,height:27,display:"grid",placeItems:"center",borderRadius:4,background:"#1f2937",color:"#facc15",fontSize:9,fontWeight:1000};
const v2LeaderText={display:"grid",gap:2,minWidth:0,overflow:"hidden"};
const v2LeaderValue={fontStyle:"normal",fontWeight:1000,color:"#facc15",fontSize:12};
const v2LeaderEmpty={padding:16,color:"#64748b",fontSize:12,textAlign:"center"};
const v2HomeGrid={display:"grid",gridTemplateColumns:"minmax(0,1.35fr) minmax(320px,.75fr)",gap:18,alignItems:"start"};
const v2HomeFeatured={display:"grid",gridTemplateColumns:"minmax(0,1fr) auto minmax(0,1fr)",gap:20,alignItems:"center",padding:"24px 18px",borderRadius:18,border:"1px solid rgba(255,255,255,.10)"};
const v2CompactList={display:"grid",gap:9};
const v2CompactGame={display:"grid",gridTemplateColumns:"minmax(0,1fr) 34px minmax(0,1fr)",alignItems:"center",gap:8,width:"100%",padding:"10px 12px",borderRadius:6,border:"1px solid rgba(148,163,184,.16)",background:"rgba(255,255,255,.035)",color:"#fff",cursor:"pointer",overflow:"hidden"};
const v2CompactTeam={display:"flex",alignItems:"center",gap:7,minWidth:0,overflow:"hidden",whiteSpace:"nowrap",fontWeight:800};
const v2CompactLogo={width:30,height:30,minWidth:30,display:"grid",placeItems:"center",overflow:"hidden"};
const v2CompactVs={textAlign:"center",fontSize:10,letterSpacing:".1em",color:"#94a3b8"};
const v2RankingList={display:"grid",gap:8};
const v2RankingTableScroll={overflowX:"auto",paddingBottom:3};
const v2RankingTableHead={display:"grid",gridTemplateColumns:"54px minmax(210px,1.35fr) 62px 72px 70px 78px 76px 76px 98px",alignItems:"center",gap:9,minWidth:900,padding:"9px 12px",background:"#05070c",borderBottom:"2px solid #dc2626",color:"#94a3b8",fontSize:10,fontWeight:1000,letterSpacing:".07em",textTransform:"uppercase"};
const v2RankingRow={display:"grid",gridTemplateColumns:"54px minmax(210px,1.35fr) 62px 72px 70px 78px 76px 76px 98px",alignItems:"center",gap:9,minWidth:900,width:"100%",padding:"10px 12px",borderRadius:4,border:"1px solid rgba(148,163,184,.14)",borderLeft:"3px solid #dc2626",background:"rgba(255,255,255,.035)",color:"#fff",cursor:"pointer",textAlign:"left"};
const v2RankingIdentity={display:"grid",gridTemplateColumns:"42px minmax(0,1fr)",alignItems:"center",gap:9,minWidth:0};
const v2RankingLogo={width:40,height:40,display:"grid",placeItems:"center",overflow:"hidden"};
const v2RankingTeam={display:"grid",gap:2,minWidth:0};
const v2ConferenceTableScroll={overflowX:"auto",border:"1px solid rgba(255,255,255,.10)",borderRadius:6};
const v2ConferenceTableHead={display:"grid",gridTemplateColumns:"48px minmax(190px,1.3fr) 74px 96px 80px 74px 90px 96px 84px 60px",alignItems:"center",gap:10,minWidth:940,padding:"10px 12px",background:"#05070c",borderBottom:"2px solid #dc2626",color:"#94a3b8",fontSize:10,fontWeight:1000,letterSpacing:".07em",textTransform:"uppercase"};
const v2ConferenceTableRow={display:"grid",gridTemplateColumns:"48px minmax(190px,1.3fr) 74px 96px 80px 74px 90px 96px 84px 60px",alignItems:"center",gap:10,minWidth:940,padding:"11px 12px",borderBottom:"1px solid rgba(255,255,255,.08)",background:"rgba(255,255,255,.025)",color:"#e5e7eb",fontSize:12};
const v2ConferenceIdentity={display:"flex",alignItems:"center",gap:10,minWidth:0,whiteSpace:"nowrap"};
const v2MovementUp={color:"#86efac",fontSize:12,fontWeight:1000};
const v2MovementDown={color:"#fca5a5",fontSize:12,fontWeight:1000};
const v2MovementEven={color:"#64748b",fontSize:12,fontWeight:1000};
const v2ResultRow={display:"grid",gridTemplateColumns:"1fr auto 1fr 70px",gap:10,alignItems:"center",padding:"11px 12px",borderRadius:12,background:"rgba(255,255,255,.035)",border:"1px solid rgba(148,163,184,.12)"};
const v2CoachSpotlight={display:"grid",gridTemplateColumns:"110px 1fr",alignItems:"center",gap:18};
const v2WireList={display:"grid",gap:10};

const v2HeroStats={display:"grid",gridTemplateColumns:"repeat(3,minmax(76px,1fr))",gap:10};
const v2FeaturedGame={padding:"clamp(18px,3vw,32px)",borderRadius:22,border:"1px solid rgba(250,204,21,.28)",boxShadow:"0 24px 68px rgba(0,0,0,.34)"};
const v2FeaturedKicker={textAlign:"center",color:"#facc15",fontWeight:1000,letterSpacing:".12em",fontSize:12,marginBottom:18};
const v2FeaturedMatchup={display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(150px,auto) minmax(0,1fr)",gap:24,alignItems:"center"};
const v2FeaturedScore={display:"grid",justifyItems:"center",gap:4,color:"#fff",textAlign:"center"};
const v2MatchupTeam={display:"grid",justifyItems:"center",gap:7,textAlign:"center",minWidth:0};
const v2MatchupTeamCompact={...v2MatchupTeam,gap:5};
const v2LogoRank={position:"relative",display:"inline-grid",placeItems:"center"};
const v2SideLabel={color:"#64748b",fontSize:9,fontWeight:1000,letterSpacing:".12em"};
const v2FilterBar={display:"grid",gap:12,padding:"14px",borderRadius:16,background:"rgba(15,23,42,.82)",border:"1px solid rgba(148,163,184,.14)"};
const v2WeekTabs={display:"flex",gap:7,overflowX:"auto",paddingBottom:5};
const v2WeekTab={border:"1px solid rgba(148,163,184,.22)",borderRadius:999,padding:"8px 12px",background:"rgba(2,6,23,.72)",color:"#cbd5e1",fontWeight:900,cursor:"pointer",whiteSpace:"nowrap"};
const v2WeekTabActive={...v2WeekTab,background:"#facc15",borderColor:"#fde68a",color:"#111827"};
const v2FilterInputs={display:"grid",gridTemplateColumns:"minmax(220px,1fr) 180px auto",gap:10};
const v2GameGrid={display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:14};
const v2GameCard={display:"grid",gap:14,padding:16,borderRadius:8,background:"linear-gradient(155deg,rgba(14,19,30,.985),rgba(4,7,13,.995))",border:"1px solid rgba(255,255,255,.12)",borderTop:"3px solid #dc2626",boxShadow:"0 16px 42px rgba(0,0,0,.28)",minWidth:0};
const v2GameCardTop={display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,color:"#cbd5e1",fontSize:12,fontWeight:900};
const v2FinalBadge={padding:"5px 8px",borderRadius:999,background:"rgba(22,163,74,.18)",color:"#86efac",border:"1px solid rgba(74,222,128,.24)"};
const v2UpcomingBadge={...v2FinalBadge,background:"rgba(37,99,235,.18)",color:"#bfdbfe",borderColor:"rgba(96,165,250,.24)"};
const v2CardMatchup={display:"grid",gridTemplateColumns:"minmax(0,1fr) auto minmax(0,1fr)",gap:8,alignItems:"center"};
const v2CardScore={fontSize:"clamp(20px,2vw,30px)",fontWeight:1000,color:"#facc15",textAlign:"center",whiteSpace:"nowrap"};
const v2GameMeta={display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,paddingTop:10,borderTop:"1px solid rgba(148,163,184,.12)",color:"#94a3b8",fontSize:11};
const v2GameLinks={display:"flex",gap:10,flexWrap:"wrap",fontSize:12,color:"#93c5fd"};
const v2CardActions={display:"flex",gap:7,flexWrap:"wrap"};

const v2ByeGrid={display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:14};
const v2SeedCard={display:"grid",justifyItems:"center",gap:7,textAlign:"center",padding:18,borderRadius:17,border:"1px solid rgba(250,204,21,.20)"};
const v2PlayoffGrid={display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:14};
const v2PlayoffGame={display:"grid",gridTemplateColumns:"1fr auto 1fr",alignItems:"center",gap:12,padding:18,borderRadius:17,background:"rgba(255,255,255,.035)",border:"1px solid rgba(148,163,184,.14)"};
const v2PlayoffAt={color:"#facc15",fontWeight:1000,fontSize:12};
const v2BubbleList={display:"grid",gap:9};
const v2MediaGrid={display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:14};
const v2MediaCard={display:"grid",gap:16,padding:18,borderRadius:18,border:"1px solid rgba(148,163,184,.16)"};
const v2RecapPreview={whiteSpace:"pre-wrap",wordBreak:"break-word",padding:18,borderRadius:14,background:"rgba(2,6,23,.78)",border:"1px solid rgba(148,163,184,.16)",color:"#e2e8f0",lineHeight:1.55,margin:0};

const v2UserGrid={display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12};
const v2UserCard={display:"grid",gap:14,padding:15,borderRadius:15,background:"rgba(255,255,255,.035)",border:"1px solid rgba(148,163,184,.14)"};
const v2UserIdentity={display:"grid",gridTemplateColumns:"56px minmax(0,1fr) auto",alignItems:"center",gap:10};
const v2ActiveBadge={padding:"5px 8px",borderRadius:999,background:"rgba(22,163,74,.16)",color:"#86efac",fontSize:9,fontWeight:1000};
const v2InactiveBadge={...v2ActiveBadge,background:"rgba(100,116,139,.18)",color:"#cbd5e1"};
const v2ScheduleList={display:"grid",gap:13};
const v2ScheduleEditor={display:"grid",gap:14,padding:16,borderRadius:16,background:"rgba(255,255,255,.03)",border:"1px solid rgba(148,163,184,.14)"};
const v2ScheduleEditorHead={display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"};
const v2AdminGrid={display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:18};
const v2HealthList={display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10};
const v2ToolGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12};
const v2ToolCard={display:"grid",gap:7,textAlign:"left",padding:16,borderRadius:15,background:"rgba(255,255,255,.035)",border:"1px solid rgba(148,163,184,.16)",color:"#fff",cursor:"pointer"};
const v2CountPill={display:"inline-grid",placeItems:"center",minWidth:36,height:30,borderRadius:999,background:"rgba(250,204,21,.16)",color:"#facc15",fontWeight:1000};

const v2CoachSeasonStrip={display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:10,margin:"14px 0 20px"};
const v2FormDots={display:"flex",gap:5,alignItems:"center"};
const v2FormWin={display:"inline-grid",placeItems:"center",width:24,height:24,borderRadius:999,background:"#166534",color:"#dcfce7",fontStyle:"normal",fontSize:11};
const v2FormLoss={...v2FormWin,background:"#991b1b",color:"#fee2e2"};
const v2NextOpponent={display:"flex",alignItems:"center",gap:7};

const v2MobileNav={position:"fixed",left:"max(6px,env(safe-area-inset-left))",right:"max(6px,env(safe-area-inset-right))",bottom:"max(8px,env(safe-area-inset-bottom))",zIndex:150,gridTemplateColumns:"repeat(6,minmax(0,1fr))",gap:2,padding:6,borderRadius:12,background:"rgba(2,6,23,.97)",border:"1px solid rgba(255,255,255,.16)",borderTop:"3px solid #dc2626",backdropFilter:"blur(18px)",boxShadow:"0 18px 60px rgba(0,0,0,.48)"};
const v2MobileNavButton={display:"grid",justifyItems:"center",gap:2,padding:"7px 3px",border:0,borderRadius:11,background:"transparent",color:"#94a3b8",fontSize:10,fontWeight:900,cursor:"pointer"};
const v2MobileNavActive={...v2MobileNavButton,background:"rgba(250,204,21,.15)",color:"#facc15"};

