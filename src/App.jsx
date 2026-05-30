import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const WEEKS = ["Week 1","Week 2","Week 3","Week 4","Week 5","Week 6","Week 7","Week 8","Week 9","Week 10","Week 11","Week 12","Week 13","Week 14","Conference Championship Week","Bowl Week 1","Bowl Week 2","Bowl Week 3","National Championship Week"];
const POSITIONS = ["QB","RB","WR","TE","LT","LG","C","RG","RT","EDGE","DT","SAM","WILL","MIKE","CB","FS","SS","KR","PR","K","P"];
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

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [currentYear, setCurrentYear] = useState("2029");
  const [currentWeek, setCurrentWeek] = useState("10");
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
  const [draggedStanding, setDraggedStanding] = useState(null);
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
  const selectedTeam = activeTab.startsWith("team-") ? teams.find((team) => `team-${team.id}` === activeTab) : null;
  const currentYearResults = results.filter((r) => String(r.season_year) === String(currentYear));
  const orderedStandings = standingsOrder.length
    ? standingsOrder.map((id) => standings.find((row) => row.team_id === id)).filter(Boolean)
    : standings;
  function goToTeam(teamId) { setActiveTab(`team-${teamId}`); }
  function reorderStandings(dropIndex) {
    if (draggedStanding === null || draggedStanding === dropIndex) return;
    setStandingsOrder((prev) => {
      const base = prev.length ? prev : standings.map((row) => row.team_id);
      const next = [...base];
      const [moved] = next.splice(draggedStanding, 1);
      next.splice(dropIndex, 0, moved);
      return next;
    });
    setDraggedStanding(null);
  }

  const tabs = [["dashboard","Dashboard"],["assignments","Users/Team Assignments"],["h2h","User vs User H2H"],["allAmericans","All-Americans"],["awards","Awards"],["heismans","Heisman Winners"],["nationalChampions","National Champions"],["draft","CFBElite 27 Draft Order"],["playoff","CFP Bracket"],...teamOptions.map((team) => [`team-${team.id}`, team.name])];

  async function loadData() {
    setLoading(true); setError("");
    const [teamsRes, usersRes, assignmentsRes, standingsRes, resultsRes, aaRes, awardsRes, heismanRes, championsRes, draftRes, playoffRes, recruitingRes, historyRes] = await Promise.all([
      supabase.from("teams").select("*").order("name"),
      supabase.from("discord_users").select("*").order("discord_username"),
      supabase.from("team_assignments").select("*, teams(name), discord_users(discord_username)").order("created_at"),
      supabase.from("team_standings").select("*").order("team_name"),
      supabase.from("game_results").select(`*, team_1:teams!game_results_team_1_id_fkey(name), team_2:teams!game_results_team_2_id_fkey(name), user_1:discord_users!game_results_team_1_user_id_fkey(discord_username), user_2:discord_users!game_results_team_2_user_id_fkey(discord_username)`).order("created_at", { ascending: false }),
      supabase.from("all_americans").select("*, teams(name)").order("season_year", { ascending: false }),
      supabase.from("awards").select("*, teams(name)").order("season_year", { ascending: false }),
      supabase.from("heisman_winners").select("*, teams(name)").order("season_year", { ascending: false }),
      supabase.from("national_champions").select("*, teams(name), discord_users(discord_username)").order("season_year", { ascending: false }),
      supabase.from("draft_order_27").select("*, discord_users(discord_username)").order("pick_number"),
      supabase.from("playoff_games").select(`*, top_team:teams!playoff_games_top_team_id_fkey(name), bottom_team:teams!playoff_games_bottom_team_id_fkey(name)`).order("sort_order"),
      supabase.from("recruiting_classes").select("*, teams(name)").order("season_year", { ascending: false }),
      supabase.from("team_history_records").select("*, teams(name)").order("season_year", { ascending: false }),
    ]);
    const firstError = [teamsRes, usersRes, assignmentsRes, standingsRes, resultsRes, aaRes, awardsRes, heismanRes, championsRes, draftRes, playoffRes, recruitingRes, historyRes].find((r) => r.error)?.error;
    if (firstError) setError(firstError.message);
    else {
      setTeams(teamsRes.data || []); setUsers(usersRes.data || []);
      setAssignments((assignmentsRes.data || []).sort((a,b) => (a.teams?.name || "").localeCompare(b.teams?.name || "")));
      const loadedStandings = standingsRes.data || [];
      setStandings(loadedStandings);
      setStandingsOrder((prev) => {
        const ids = loadedStandings.map((row) => row.team_id);
        const kept = prev.filter((id) => ids.includes(id));
        const added = ids.filter((id) => !kept.includes(id));
        return [...kept, ...added];
      });
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
    setNewResult({ ...EMPTY_RESULT, season_year: Number(currentYear) }); await loadData();
  }
  async function deleteRow(table, id) { const { error: deleteError } = await supabase.from(table).delete().eq("id", id); if (deleteError) setError(deleteError.message); await loadData(); }
  async function updateRow(table, id, field, value) { const { error: updateError } = await supabase.from(table).update({ [field]: value === "" ? null : value }).eq("id", id); if (updateError) setError(updateError.message); else setError(""); await loadData(); }
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
    {activeTab === "dashboard" && <><Stats currentYear={currentYear} setCurrentYear={setCurrentYear} currentWeek={currentWeek} setCurrentWeek={setCurrentWeek} teams={teams}/><UserStandings teams={teamOptions} results={currentYearResults} goToTeam={goToTeam}/><RecordResult newResult={newResult} setNewResult={setNewResult} teams={teamOptions} users={userOptions} submitResult={submitResult}/><Standings rows={orderedStandings.filter((r)=>JSON.stringify(r).toLowerCase().includes(search.standings.toLowerCase()))} search={search.standings} setSearch={(v)=>setSearch({...search,standings:v})} goToTeam={goToTeam} draggedStanding={draggedStanding} setDraggedStanding={setDraggedStanding} reorderStandings={reorderStandings}/><Results rows={currentYearResults.filter((r)=>JSON.stringify(r).toLowerCase().includes(search.results.toLowerCase()))} deleteResult={(id)=>deleteRow("game_results", id)} search={search.results} setSearch={(v)=>setSearch({...search,results:v})}/></>}
    {activeTab === "assignments" && <Assignments rows={assignments} teams={teamOptions} users={userOptions} addAssignment={addAssignment} updateRow={updateRow} deleteRow={deleteRow} drafts={draftAssignments} setDrafts={setDraftAssignments} saveDraft={saveDraft} getDraft={getDraft} teamChange={teamChange} setTeamChange={setTeamChange} changeUserTeam={changeUserTeam}/>}    
    {activeTab === "h2h" && <H2H results={results} search={search.h2h} setSearch={(v)=>setSearch({...search,h2h:v})}/>}    
    {activeTab === "allAmericans" && <AllAmericans rows={allAmericans} teams={teamOptions} addRow={addAA} updateRow={updateRow} deleteRow={deleteRow} rankings={rankingRows(teamOptions, allAmericans)} drafts={draftAllAmericans} setDrafts={setDraftAllAmericans} saveDraft={saveDraft} getDraft={getDraft}/>}    
    {activeTab === "awards" && <Awards rows={awards} teams={teamOptions} addRow={addAward} updateRow={updateRow} deleteRow={deleteRow} rankings={rankingRows(teamOptions, awards)} drafts={draftAwards} setDrafts={setDraftAwards} saveDraft={saveDraft} getDraft={getDraft}/>}    
    {activeTab === "heismans" && <Heismans rows={heismans} teams={teamOptions} addRow={addHeisman} updateRow={updateRow} deleteRow={deleteRow} drafts={draftHeismans} setDrafts={setDraftHeismans} saveDraft={saveDraft} getDraft={getDraft}/>}    
    {activeTab === "nationalChampions" && <NationalChampions rows={nationalChampions} teams={teamOptions} users={userOptions} addRow={addNationalChampion} updateRow={updateRow} deleteRow={deleteRow} drafts={draftChampions} setDrafts={setDraftChampions} saveDraft={saveDraft} getDraft={getDraft}/>}        
    {activeTab === "draft" && <DraftOrder rows={draftOrder} users={userOptions} updateRow={updateRow} drafts={draftDraftOrder} setDrafts={setDraftDraftOrder} saveDraft={saveDraft} getDraft={getDraft}/>}        
    {activeTab === "playoff" && <Playoff rows={playoffGames} teams={teamOptions} updateRow={updateRow} drafts={draftPlayoff} setDrafts={setDraftPlayoff} saveDraft={saveDraft} getDraft={getDraft}/>}        
    {selectedTeam && <TeamPage team={selectedTeam} standings={standings.find((r)=>r.team_id===selectedTeam.id)} results={results.filter((r)=>r.team_1_id===selectedTeam.id||r.team_2_id===selectedTeam.id)} allAmericans={allAmericans.filter((r)=>r.team_id===selectedTeam.id)} awards={awards.filter((r)=>r.team_id===selectedTeam.id)} heismans={heismans.filter((r)=>r.team_id===selectedTeam.id)} recruiting={recruiting.filter((r)=>r.team_id===selectedTeam.id)} historyRows={historyRows.filter((r)=>r.team_id===selectedTeam.id)} addRecruiting={addRecruiting} addHistory={addHistory} updateRow={updateRow} deleteRow={deleteRow} newRecruiting={newRecruiting} setNewRecruiting={setNewRecruiting} newHistory={newHistory} setNewHistory={setNewHistory}/>}    
  </div></div>;
}

function Header({ loading, reload }) { return <header style={header}><div><h1 style={title}>CFBElite 27 Dashboard</h1><p style={subtitle}>Live Supabase League Management System</p></div><button onClick={reload} style={statusBox}>{loading ? "Loading..." : "LIVE DATABASE"}</button></header>; }
function TabBar({ tabs, activeTab, setActiveTab }) { return <div style={tabScroller}><div style={tabRow}>{tabs.map(([key,label])=><button key={key} onClick={()=>setActiveTab(key)} style={activeTab===key?activeTabStyle:tabStyle}>{label}</button>)}</div></div>; }
function Stats({ currentYear, setCurrentYear, currentWeek, setCurrentWeek, teams }) { return <div style={statsGrid}><Stat title="Teams" value={teams.length}/><div style={statCard}><div style={statTitle}>Current Year</div><input value={currentYear} onChange={(e)=>setCurrentYear(e.target.value)} style={statInput}/></div><div style={statCard}><div style={statTitle}>Current Week</div><input value={currentWeek} onChange={(e)=>setCurrentWeek(e.target.value)} style={statInput}/></div></div>; }
function Stat({ title, value }) { return <div style={statCard}><div style={statTitle}>{title}</div><div style={statValue}>{value}</div></div>; }
function UserStandings({ teams, results, goToTeam }) { const ordered = teams.map((t)=>({ team:t, record:recordFromResults(t.id, results) })).sort((a,b)=> b.record.wins - a.record.wins || a.record.losses - b.record.losses || a.team.name.localeCompare(b.team.name)); return <section style={card}><h2 style={sectionTitle}>User vs User Standings</h2><Table headers={["#","Team","Record","Avg PF","Avg PA","Top 25"]}>{ordered.map(({team:t, record:r}, index)=>{return <tr key={t.id} style={trStyle}><td style={td}>#{index + 1}</td><td style={clickableTeamCell} onClick={()=>goToTeam(t.id)}>{t.name}</td><td style={td}>{r.wins}-{r.losses}</td><td style={td}>{r.avgPf}</td><td style={td}>{r.avgPa}</td><td style={td}>{top25Wins(t.id, results)}</td></tr>})}</Table></section>; }
function RecordResult({ newResult, setNewResult, teams, users, submitResult }) { return <section style={card}><h2 style={sectionTitle}>Record User vs User Result</h2><div style={formGrid}><input placeholder="Year" value={newResult.season_year} onChange={(e)=>setNewResult({...newResult,season_year:e.target.value})} style={input}/><select value={newResult.week} onChange={(e)=>setNewResult({...newResult,week:e.target.value})} style={input}>{WEEKS.map((w)=><option key={w}>{w}</option>)}</select><select value={newResult.team_1_id} onChange={(e)=>setNewResult({...newResult,team_1_id:e.target.value})} style={input}><option value="">Team 1</option>{teams.map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select><select value={newResult.team_1_user_id} onChange={(e)=>setNewResult({...newResult,team_1_user_id:e.target.value})} style={input}><option value="">Team 1 Discord</option>{users.map((u)=><option key={u.id} value={u.id}>{u.discord_username}</option>)}</select><input placeholder="Team 1 Rank" value={newResult.team_1_rank} onChange={(e)=>setNewResult({...newResult,team_1_rank:e.target.value})} style={input}/><input placeholder="Team 1 Score" value={newResult.team_1_score} onChange={(e)=>setNewResult({...newResult,team_1_score:e.target.value})} style={input}/><select value={newResult.team_2_id} onChange={(e)=>setNewResult({...newResult,team_2_id:e.target.value})} style={input}><option value="">Team 2</option>{teams.map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select><select value={newResult.team_2_user_id} onChange={(e)=>setNewResult({...newResult,team_2_user_id:e.target.value})} style={input}><option value="">Team 2 Discord</option>{users.map((u)=><option key={u.id} value={u.id}>{u.discord_username}</option>)}</select><input placeholder="Team 2 Rank" value={newResult.team_2_rank} onChange={(e)=>setNewResult({...newResult,team_2_rank:e.target.value})} style={input}/><input placeholder="Team 2 Score" value={newResult.team_2_score} onChange={(e)=>setNewResult({...newResult,team_2_score:e.target.value})} style={input}/><input placeholder="Tags" value={newResult.tags} onChange={(e)=>setNewResult({...newResult,tags:e.target.value})} style={input}/><button onClick={submitResult} style={button}>Record Result</button></div></section>; }
function SearchBox({ value, onChange }) { return <input value={value} onChange={(e)=>onChange(e.target.value)} placeholder="Search..." style={searchInput}/>; }
function Standings({ rows, search, setSearch, goToTeam, draggedStanding, setDraggedStanding, reorderStandings }) { return <section style={card}><div style={sectionTop}><div><h2 style={sectionTitle}>Commissioner League Standings</h2><p style={mutedText}>Drag teams up or down to set commissioner order.</p></div><SearchBox value={search} onChange={setSearch}/></div><Table headers={["Move","#","Team","W","L","PF","PA","Top 25","Conf","Nattys","Bowl"]}>{rows.map((r, index)=><tr key={r.team_id} style={trStyle} draggable onDragStart={()=>setDraggedStanding(index)} onDragOver={(e)=>e.preventDefault()} onDrop={()=>reorderStandings(index)}><td style={td}>☰</td><td style={td}>#{index + 1}</td><td style={clickableTeamCell} onClick={()=>goToTeam(r.team_id)}>{r.team_name}</td><td style={td}>{r.wins}</td><td style={td}>{r.losses}</td><td style={td}>{r.pf}</td><td style={td}>{r.pa}</td><td style={td}>{r.top_25_wins ?? 0}</td><td style={td}>{r.conference_titles ?? 0}</td><td style={td}>{r.national_titles ?? 0}</td><td style={td}>{r.bowl_wins ?? 0}-{r.bowl_losses ?? 0}</td></tr>)}</Table></section>; }
function Results({ rows, deleteResult, search, setSearch }) { return <section style={card}><div style={sectionTop}><h2 style={sectionTitle}>User vs User Results</h2><SearchBox value={search} onChange={setSearch}/></div><Table headers={["Year","Week","Team 1","User 1","Score","Team 2","User 2","Tags",""]}>{rows.map((r)=><tr key={r.id} style={trStyle}><td style={td}>{r.season_year}</td><td style={td}>{r.week}</td><td style={teamCell}>{r.team_1?.name||"—"}</td><td style={td}>{r.user_1?.discord_username||"—"}</td><td style={td}>{r.team_1_score}-{r.team_2_score}</td><td style={teamCell}>{r.team_2?.name||"—"}</td><td style={td}>{r.user_2?.discord_username||"—"}</td><td style={td}>{r.tags?.join(", ")||"—"}</td><td style={td}><DeleteButton onClick={()=>deleteResult(r.id)}/></td></tr>)}</Table></section>; }
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
function H2H({ results, search, setSearch }) { const map=new Map(); results.forEach((r)=>{const u1=r.user_1?.discord_username;const u2=r.user_2?.discord_username;if(!u1||!u2)return;const t1Win=r.team_1_score>r.team_2_score;[[u1,u2,t1Win],[u2,u1,!t1Win]].forEach(([u,o,w])=>{const k=`${u}-${o}`;if(!map.has(k))map.set(k,{user:u,opp:o,w:0,l:0});if(w)map.get(k).w++;else map.get(k).l++;});}); const rows=[...map.values()].filter((r)=>JSON.stringify(r).toLowerCase().includes(search.toLowerCase())).sort((a,b)=>a.user.localeCompare(b.user)||a.opp.localeCompare(b.opp)); return <section style={card}><div style={sectionTop}><h2 style={sectionTitle}>User vs User H2H</h2><SearchBox value={search} onChange={setSearch}/></div><Table headers={["User","Opponent","W","L","Record"]}>{rows.map((r)=><tr key={`${r.user}-${r.opp}`} style={trStyle}><td style={teamCell}>{r.user}</td><td style={td}>{r.opp}</td><td style={td}>{r.w}</td><td style={td}>{r.l}</td><td style={td}>{r.w}-{r.l}</td></tr>)}</Table></section>; }
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
function TeamPage({ team, standings, results, allAmericans, awards, heismans, recruiting, historyRows, addRecruiting, addHistory, updateRow, deleteRow, newRecruiting, setNewRecruiting, newHistory, setNewHistory }) { const stat=standings||{}; const rec=recordFromResults(team.id, results); const bowl=bowlRecord(team.id, results); return <section style={card}><h2 style={sectionTitle}>{team.name}</h2><div style={statsGrid}><Stat title="Overall" value={`${stat.wins??0}-${stat.losses??0}`}/><Stat title="Avg PF" value={rec.avgPf}/><Stat title="Avg PA" value={rec.avgPa}/><Stat title="Top 25" value={top25Wins(team.id, results)}/><Stat title="Top 25 Class" value={recruiting.filter((r)=>Number(r.rank) >= 1 && Number(r.rank) <= 25).length}/><Stat title="Awards" value={awards.length}/><Stat title="All-Americans" value={allAmericans.length}/><Stat title="Heismans" value={heismans.length}/><Stat title="Conf Titles" value={titleCount(team.id, results, "Conference Championship Week")}/><Stat title="Nattys" value={titleCount(team.id, results, "National Championship Week")}/><Stat title="Bowl" value={`${bowl.wins}-${bowl.losses}`}/></div><div style={twoCol}><div style={miniCard}><h3>Recruiting Rankings</h3><div style={formGrid}><input placeholder="Year" value={newRecruiting.season_year} onChange={(e)=>setNewRecruiting({...newRecruiting,season_year:e.target.value})} style={input}/><input placeholder="Rank" value={newRecruiting.rank} onChange={(e)=>setNewRecruiting({...newRecruiting,rank:e.target.value})} style={input}/><button onClick={()=>addRecruiting(team.id)} style={button}>Add</button></div>{recruiting.map((r)=><div key={r.id} style={miniRow}>{r.season_year}: #{r.rank} <DeleteButton onClick={()=>deleteRow("recruiting_classes",r.id)}/></div>)}</div><div style={miniCard}><h3>History</h3><div style={formGrid}><input placeholder="Year" value={newHistory.season_year} onChange={(e)=>setNewHistory({...newHistory,season_year:e.target.value})} style={input}/><input placeholder="Record" value={newHistory.record} onChange={(e)=>setNewHistory({...newHistory,record:e.target.value})} style={input}/><button onClick={()=>addHistory(team.id)} style={button}>Add</button></div>{historyRows.map((r)=><div key={r.id} style={miniRow}><input value={r.season_year} onChange={(e)=>updateRow("team_history_records",r.id,"season_year",Number(e.target.value))} style={smallInput}/><input value={r.record || ""} onChange={(e)=>updateRow("team_history_records",r.id,"record",e.target.value)} style={smallInput}/><DeleteButton onClick={()=>deleteRow("team_history_records",r.id)}/></div>)}</div></div><Results rows={results} deleteResult={()=>{}} search="" setSearch={()=>{}}/><div style={twoCol}><MiniList title="All-Americans" rows={allAmericans.map((r)=>`${r.player_name} — ${r.type}, ${r.position}, ${r.season_year}`)}/><MiniList title="Awards" rows={awards.map((r)=>`${r.player_name} — ${r.award_name}, ${r.position}, ${r.season_year}`)}/><MiniList title="Heisman Winners" rows={heismans.map((r)=>`${r.player_name} — ${r.position}, ${r.season_year}`)}/></div></section>; }
function MiniList({ title, rows }) { return <div style={miniCard}><h3>{title}</h3>{rows.map((r,i)=><div key={i} style={miniRow}>{r}</div>)}</div>; }
function Table({ headers, children }) { return <div style={{overflowX:"auto",marginTop:20}}><table style={table}><thead><tr>{headers.map((h)=><th key={h} style={th}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
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
const card={background:"#18181b",border:"1px solid #27272a",borderRadius:24,padding:24,marginBottom:32};
const sectionTop={display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,flexWrap:"wrap"};
const sectionTitle={fontSize:30,fontWeight:900,margin:0,color:"white"};
const formGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:16,marginTop:20};
const input={background:"#27272a",border:"1px solid #3f3f46",color:"white",padding:14,borderRadius:12,fontSize:15,width:"100%",boxSizing:"border-box"};
const smallInput={...input,width:"120px",marginRight:8};
const searchInput={...input,maxWidth:320};
const button={background:"#dc2626",color:"white",border:"none",borderRadius:12,padding:14,fontWeight:700,cursor:"pointer"};
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
