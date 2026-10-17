(() => {
  const cfg = window.EXAM_CONFIG || {};
  const configured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes('YOUR-PROJECT') && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes('YOUR_');
  const sb = configured && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const $ = id => document.getElementById(id);
  const views = ['loginView','introView','examView','doneView'];
  let user = null, username = '', sectionIndex = 0, remaining = 0, sectionDuration = 0, timer = null, startedAt = null;
  let answers = { listening: {}, reading: {}, writing: { task1: '', task2: '' } }, submitting = false;
  const sections = [
    { key:'listening', title:'Listening', minutes:30, src:'tests/Listening.html', hint:'Click play in the audio player to start. Playback cannot be paused, rewound, or sped up.' },
    { key:'reading', title:'Reading', minutes:60, src:'tests/Reading.html', hint:'Complete all three passages. When the timer ends, this section locks automatically.' },
    { key:'writing', title:'Writing', minutes:60, src:null, hint:'Complete both tasks. Your work is saved as you type.' }
  ];
  function show(id){ views.forEach(v => $(v).classList.toggle('hidden',v!==id)); }
  function cleanName(v){ return v.trim().toLowerCase().replace(/\s+/g,'.').replace(/[^a-z0-9._-]/g,''); }
  function localKey(){ return 'onego-draft-'+(user?.id || cleanName(username)); }
  function saveDraft(){ try { localStorage.setItem(localKey(),JSON.stringify({answers,sectionIndex,remaining,startedAt})); $('saveStatus').textContent='Draft saved in this browser'; } catch(e){} }
  function restoreDraft(){ try { const d=JSON.parse(localStorage.getItem(localKey())||'null'); if(d && d.answers) answers=d.answers; return d; } catch(e){return null;} }
  function words(s){ const t=s.trim(); return t ? t.split(/\s+/).length : 0; }
  function updateWordCounts(){ $('count1').textContent=words($('task1').value)+' words'; $('count2').textContent=words($('task2').value)+' words'; answers.writing.task1=$('task1').value; answers.writing.task2=$('task2').value; saveDraft(); }
  function collectFrameAnswers(key){
    const frame=$('testFrame'); let doc; try{doc=frame.contentDocument;}catch(e){return;}
    if(!doc) return;
    const out={};
    // Collect conventional q1...q40 fields, including hidden fields used by drag/drop questions.
    for(let n=1;n<=40;n++){
      const els=Array.from(doc.querySelectorAll(`[id="q${n}"], [name="q${n}"]`));
      if(!els.length) continue;
      const vals=[];
      els.forEach(el=>{
        if((el.type==='radio'||el.type==='checkbox')&&!el.checked)return;
        if(el.type==='hidden' || el.tagName==='INPUT' || el.tagName==='TEXTAREA' || el.tagName==='SELECT'){
          const v=(el.value||'').trim(); if(v && !vals.includes(v)) vals.push(v);
        }
      });
      if(vals.length) out['q'+n]=vals.length===1?vals[0]:vals;
    }
    // Also capture grouped IELTS items such as q18-20 and q27-28.
    doc.querySelectorAll('input, select, textarea').forEach(el=>{
      const key=(el.id.match(/^q\d+(?:-\d+)?$/i)||el.name.match(/^q\d+(?:-\d+)?$/i)||[])[0];
      if(!key) return;
      if((el.type==='radio'||el.type==='checkbox')&&!el.checked) return;
      const val=(el.value||'').trim(); if(!val) return;
      const k=key.toLowerCase();
      if(!out[k]) out[k]=val;
      else { const arr=Array.isArray(out[k])?out[k]:[out[k]]; if(!arr.includes(val))arr.push(val); out[k]=arr; }
    });
    // Some drag/drop answers are represented by drop zones rather than qN inputs.
    doc.querySelectorAll('.drop-zone, .map-drop-zone, [data-question-id]').forEach(el=>{
      const n=el.dataset.questionId || (el.id||'').match(/\d+/)?.[0];
      const val=(el.innerText||'').trim(); if(n && val && !out['q'+n]) out['q'+n]=val;
    });
    answers[key]=out; saveDraft();
  }
  function configureFrame(){
    const frame=$('testFrame');
    frame.onload=()=>{
      try{
        const doc=frame.contentDocument, win=frame.contentWindow;
        // Hide all self-checking UI and controls which conflict with the one-way exam timer.
        const style=doc.createElement('style'); style.textContent=`#deliver-button,.footer__deliverButton___3FM07,#result-modal,.result-modal,.timer-container,.timer-controls,#speed-btn,#speed-options,#progress-bar,#new-volume-slider,#volume-btn{display:none!important}`; doc.head.appendChild(style);
        doc.querySelectorAll('#deliver-button,.footer__deliverButton___3FM07').forEach(b=>b.remove());
        doc.querySelectorAll('#timer-toggle-btn,#timer-reset-btn').forEach(b=>{b.disabled=true;b.style.display='none';});
        // Disable text selection/context menus only around the page's answer controls is intentionally avoided for accessibility.
        if(sections[sectionIndex].key==='listening'){
          const audio=doc.getElementById('global-audio-player');
          const play=doc.getElementById('play-pause-btn'); const seek=doc.getElementById('progress-bar');
          if(seek){seek.disabled=true;seek.style.pointerEvents='none';}
          if(audio){audio.playbackRate=1;let maxTime=0;audio.addEventListener('timeupdate',()=>{maxTime=Math.max(maxTime,audio.currentTime);});audio.addEventListener('seeking',()=>{if(audio.currentTime<maxTime)audio.currentTime=maxTime;});audio.addEventListener('ratechange',()=>{if(audio.playbackRate!==1)audio.playbackRate=1;});audio.addEventListener('pause',()=>{if(!audio.ended && startedAt)audio.play().catch(()=>{});});if(play)audio.addEventListener('playing',()=>{play.style.display='none';},{once:true});}
        }
      }catch(e){console.warn('Could not apply exam restrictions to test frame',e);}
    };
  }
  function openSection(i, initialRemaining=null, collectPrevious=true){
    if(i>0 && collectPrevious) collectFrameAnswers(sections[i-1].key);
    sectionIndex=i; const sec=sections[i]; sectionDuration=sec.minutes*60; remaining=initialRemaining===null?sectionDuration:Math.max(0,initialRemaining);
    $('sectionKicker').textContent=`SECTION ${i+1} OF 3`; $('sectionTitle').textContent=sec.title; $('sectionHint').textContent=sec.hint;
    $('clock').textContent=formatTime(remaining); $('clock').parentElement.classList.remove('urgent');
    $('progress').style.width=((i/3)*100)+'%';
    $('frameWrap').classList.toggle('hidden',sec.key==='writing'); $('writingPanel').classList.toggle('hidden',sec.key!=='writing');
    $('finishSection').classList.toggle('hidden',sec.key!=='writing');
    if(sec.key==='writing'){
      $('testFrame').src='about:blank'; $('task1').value=answers.writing.task1||''; $('task2').value=answers.writing.task2||''; updateWordCounts();
    }else{
      configureFrame(); $('testFrame').src=sec.src;
    }
    saveDraft(); startClock();
  }
  function formatTime(s){return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
  function startClock(){clearInterval(timer); let ticks=0; timer=setInterval(()=>{remaining--; ticks++; $('clock').textContent=formatTime(Math.max(0,remaining)); $('progress').style.width=((sectionIndex+(1-remaining/sectionDuration))/3*100)+'%'; if(remaining<=60)$('clock').parentElement.classList.add('urgent'); if(ticks%10===0 && sectionIndex<2) collectFrameAnswers(sections[sectionIndex].key); if(remaining<=0){clearInterval(timer);advanceSection(true);} saveDraft();},1000);}
  function advanceSection(auto=false){
    if(sectionIndex===0)collectFrameAnswers('listening');
    if(sectionIndex===1)collectFrameAnswers('reading');
    if(sectionIndex<2){openSection(sectionIndex+1);return;}
    submitExam();
  }
  async function submitExam(){
    if(submitting)return; submitting=true; clearInterval(timer); updateWordCounts();
    $('finishSection').disabled=true; $('finishSection').textContent='Submitting…';
    const payload={student_id:user.id,student_name:username,started_at:startedAt,submitted_at:new Date().toISOString(),answers, user_agent:navigator.userAgent};
    try{
      const {error}=await sb.from('exam_submissions').insert(payload);
      if(error)throw error;
      localStorage.removeItem(localKey()); $('submissionStatus').textContent='Submission saved securely.'; show('doneView');
    }catch(e){
      // Do not discard student work if the network is unavailable. Show a recovery code for the teacher.
      const recovery='ONEGO-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,8).toUpperCase();
      const blob=new Blob([JSON.stringify({...payload,recovery_code:recovery},null,2)],{type:'application/json'}); const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=recovery+'.json';a.click();URL.revokeObjectURL(a.href);
      $('submissionStatus').textContent='Online submission failed. A recovery file was downloaded; send it to your teacher. Error: '+(e.message||'unknown error'); show('doneView');
    }
  }
  async function signIn(event){
    event.preventDefault(); $('loginError').textContent='';
    if(!sb){$('loginError').textContent='Site setup is incomplete. Add your Supabase URL and anon key in config.js.';return;}
    const raw=$('username').value; username=raw.trim(); const normalized=cleanName(raw);
    if(!normalized){$('loginError').textContent='Enter a valid username.';return;}
    const email=normalized+(cfg.EMAIL_SUFFIX||'@students.exam.local');
    const {data,error}=await sb.auth.signInWithPassword({email,password:$('password').value});
    if(error){$('loginError').textContent='Sign-in failed. Check the username and password provided by your teacher.';return;}
    user=data.user; $('userBadge').textContent=username; $('userBadge').classList.remove('hidden');
    // Admins are routed to the private results dashboard.
    const {data:profile}=await sb.from('profiles').select('role,username').eq('id',user.id).maybeSingle();
    if(profile?.role==='admin'){window.location.href='admin.html';return;}
    const draft=restoreDraft();
    if(draft?.startedAt){
      startedAt=draft.startedAt;
      const elapsed=Math.max(0,Math.floor((Date.now()-new Date(startedAt).getTime())/1000));
      const durations=sections.map(s=>s.minutes*60); const total=durations.reduce((a,b)=>a+b,0);
      if(elapsed<total){let used=elapsed,idx=0;while(idx<2 && used>=durations[idx]){used-=durations[idx];idx++;}show('examView');openSection(idx,durations[idx]-used,false);return;}
      show('examView');openSection(2,0,false);return;
    }
    show('introView');
  }
  $('loginForm').addEventListener('submit',signIn);
  $('startExam').addEventListener('click',()=>{startedAt=new Date().toISOString();show('examView');openSection(0);});
  $('task1').addEventListener('input',updateWordCounts); $('task2').addEventListener('input',updateWordCounts);
  $('finishSection').addEventListener('click',()=>{if(confirm('Submit your exam now? You cannot return to previous sections.'))submitExam();});
  $('signOut').addEventListener('click',async()=>{if(sb)await sb.auth.signOut();location.reload();});
  window.addEventListener('beforeunload',e=>{if(!$('examView').classList.contains('hidden')&&!submitting){e.preventDefault();e.returnValue='Your exam is in progress. Leaving may interrupt your attempt.';}});
})();