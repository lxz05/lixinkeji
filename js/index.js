
/* ============ 题库（由同目录 题库.js 提供，作者换题只需替换该文件） ============ */
let QUESTIONS = window.QUESTIONS_BUILTIN || [];

/* ============ 考试系统配置 ============ */
const EXAM_SYSTEMS = {
  yiqian: {
    name: "役前机考",
    timerType: "total",
    modules: [
      { key: "psy", name: "心理", count: 250, minutes: 60, parts: [
          { name: "打分题", count: 50, groups: ["心理"], cats: ["现象归因与反驳"] },
          { name: "情境题", count: 100, groups: ["心理"], cats: ["三选一情境"] },
          { name: "迫选题", count: 100, groups: ["心理"], cats: ["强迫选择"] }
      ] },
      { key: "career", name: "职业", count: 200, minutes: 60, parts: [
          { name: "综合计算", count: 100, groups: ["计算"], cats: ["数学", "物理", "化学"] },
          { name: "综合言语常识", count: 100, groups: ["言语"],
            cats: ["成语辨析与运用", "诗词名句与文学常识", "选词填空与词语运用", "病句辨析",
              "错别字与语义重复", "修辞手法", "逻辑推理", "国防常识", "词义理解", "长句与段落主旨"] }
      ] }
    ]
  },
  tijian: {
    name: "体检机考",
    timerType: "perQuestion",
    perQuestion: 10,
    modules: [
      { key: "speech", name: "言语", count: 100, groups: ["言语"], seconds: 10,
        cats: ["词义理解", "词语辨析与搭配", "语境选词", "句意理解"] },
      { key: "math", name: "数学", count: 100, groups: ["计算"], cats: ["计算能力"], seconds: 10 },
      { key: "personality", name: "心理人格", count: 300, groups: ["人格"],
        cats: ["情绪管理", "人际关系", "抗压能力", "自我认知与自信心", "心理健康筛查",
          "效度检验", "正向心理验证", "五级量表"] }
    ]
  }
};
const GROUPS = ["心理", "人格", "计算", "言语"];
/* 学习统计的板块口径：心理与人格合并；计算即数理常识（含数理化）；言语含国防等常识 */
const STAT_CATS = [
  { key: "psy", name: "心理 / 人格", groups: ["心理", "人格"] },
  { key: "speech", name: "综合言语常识", groups: ["言语"] },
  { key: "shu", name: "综合计算", groups: ["计算"] }
];
function statCatOf(group) {
  const c = STAT_CATS.find(x => x.groups.includes(group));
  return c ? c.key : "speech";
}

/* ============ 存储键 ============ */
const SK = "quanzhen_exam_v1";
const K = {
  wrong: SK + "_wrong", fav: SK + "_fav", doubtful: SK + "_doubtful",
  suspect: SK + "_suspect", history: SK + "_history",
  cstat: SK + "_cstat", daily: SK + "_daily",
  settings: SK + "_settings"
};
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
/* 保存失败（例如 iPhone 用「文件」App 直接打开）时提示一次，不再让整页崩掉 */
let storageBroken = false;
const save = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); }
  catch (e) {
    if (!storageBroken) {
      storageBroken = true;
      setTimeout(() => alert("提示：当前打开方式不允许保存记录（常见于 iPhone 用「文件」App 直接打开）。\n请换 Chrome / 手机浏览器打开，否则退出后记录会丢。"), 0);
    }
  }
};

/* ============ 默认设置 ============ */
/* 全真模式默认「交卷后统一判分」，不再边做边出答案，更接近真机考 */
const DEFAULT_SETTINGS = { instant: false, autoNext: true };
let settings = Object.assign({}, DEFAULT_SETTINGS, load(K.settings, {}));
/* 旧版默认是即时解析：已存过设置的老用户强制迁移一次 */
const SETTINGS_VER = 2;
if (load(K.settings + "_ver", 0) < SETTINGS_VER) {
  settings.instant = false;
  save(K.settings, settings);
  save(K.settings + "_ver", SETTINGS_VER);
}

/* ============ 全局状态 ============ */
const state = {
  view: "home",
  wrong: load(K.wrong, []),
  favorites: load(K.fav, []),
  doubtful: load(K.doubtful, []),
  suspect: load(K.suspect, []),
  history: load(K.history, []),
  cstat: load(K.cstat, {}),
  daily: load(K.daily, {}),
  wrongFilter: "all", favFilter: "all",
  wrongCorrect: "all",
  wrongSys: "yiqian", favSys: "yiqian",
  pageSize: 20
};

/* 清理旧错题数据：没作答的不算错题（旧版超时未答会被误存进错题本）；补上做对次数 */
(function migrateWrong() {
  const hasChoice = w => w && w.userAnswer &&
    (typeof w.userAnswer === "string" ? w.userAnswer.length > 0 : Object.keys(w.userAnswer).length > 0);
  const before = state.wrong.length;
  state.wrong = state.wrong.filter(hasChoice);
  state.wrong.forEach(w => {
    if (typeof w.correctCount !== "number") w.correctCount = 0;
    if (!Array.isArray(w.wrongHistory) || !w.wrongHistory.length) {
      w.wrongHistory = [{ answer: w.userAnswer, time: w.wrongTime || Date.now(), timedOut: !!w.timedOut }];
    }
  });
  if (state.wrong.length !== before) save(K.wrong, state.wrong);
})();

/* 旧版统计按「板块」存 key，迁移成「考试|板块」结构（旧数据归入专项练习） */
(function migrateCstat() {
  const legacy = Object.keys(state.cstat).filter(k => !k.includes("|"));
  if (!legacy.length) return;
  legacy.forEach(g => {
    const k = "practice|" + statCatOf(g);
    const src = state.cstat[g] || {};
    if (!state.cstat[k]) state.cstat[k] = { total: 0, correct: 0 };
    state.cstat[k].total += src.total || 0;
    state.cstat[k].correct += src.correct || 0;
    delete state.cstat[g];
  });
  save(K.cstat, state.cstat);
})();

/* 考试会话 */
let exam = null;
let i = 0;               // 当前模块题目序号
let totalTimer = null, perTimer = null;
let totalRemaining = 0, perRemaining = 0;
let perTimerFor = -1;
let fillFocusFor = -1;
let autoNextTimer = null;    // 每题倒计时当前对应哪道题，防止重绘时被重置

/* ============ 工具函数 ============ */
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function shuffleArray(arr) {
  const a = arr.slice();
  for (let k = a.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [a[k], a[j]] = [a[j], a[k]];
  }
  return a;
}
function fmtTime(s) {
  s = Math.max(0, Math.floor(s || 0));
  const m = Math.floor(s / 60), sec = s % 60;
  return String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
}
const SYS_GROUPS = { yiqian: ["心理", "计算", "言语"], tijian: ["言语", "计算", "人格"] };
const SYS_LABELS = { yiqian: "役前机考", tijian: "体检机考" };
function sysOfId(id) { return String(id).startsWith("tj") ? "tijian" : "yiqian"; }
const RATE_LABELS = ["最不认同", "不太认同", "一般", "比较认同", "最认同"];

function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function saveAll() {
  save(K.wrong, state.wrong); save(K.fav, state.favorites);
  save(K.doubtful, state.doubtful); save(K.suspect, state.suspect);
  save(K.history, state.history); save(K.cstat, state.cstat);
  save(K.daily, state.daily); save(K.settings, settings);
}
function isImmediate() {
  // 非全真模式一律即时判定；全真模式按设置
  return exam.mode !== "full" ? true : settings.instant;
}

/* ============ 导航 ============ */
const NAV_VIEWS = ["home", "mine", "wrong", "favorites", "history", "stats", "settings", "about", "calc", "policy"];
/* navigate：用户主动切换页面（写入浏览历史，配合系统返回键）
   replace=true 时替换当前历史（用于过渡页、结果页、退出考试等） */
/* ============ 训练与矫正 ============ */
const TRAIN_PLANS = [{"name":"体重与 BMI 管理","tag":"体检里唯一当场就能判不合格的硬指标","sections":[{"ps":["体检量的是 BMI，不是体重。男 17.5–30、女 17–24 合格，条件兵标准更严（男 <27）。BMI≥28 还会被要求加查糖化血红蛋白。这个数字没有“练一练就过去”的空间，所以它应该排在所有训练前面。"]},{"t":"减的应该是脂肪，不是体重秤","ps":["掉得太快会连肌肉一起掉，紧接着引体、俯卧撑、1000 米全部变差。临床上比较稳妥的速度是每周 0.5–1 kg，8 周 4–8 kg；这个区间身体扛得住，力量也不至于崩。"]},{"t":"具体怎么做","ol":["先把三天的饮食拍照，标出主食、油炸、含糖饮料出现在哪几顿。多数人看完就知道问题在哪。","晚餐主食减半，蛋白质（鸡蛋、瘦肉、豆制品）不减，蔬菜管够。","每周 3 次力量：深蹲、俯卧撑、划船各 3 组 × 10 次，目的就是保肌肉。","每周 2 次 20–30 分钟中低强度有氧；步数先到 8000–10000。","每天热量缺口控制在 400–500 kcal，蛋白质吃到每公斤体重 1.2–1.5 g。"]},{"t":"考前两周","ps":["停止减重，碳水恢复正常。断碳会让力量掉一截，得不偿失。考前一周别尝试新食物。"]},{"ul":["只做有氧不吃肉：肌肉掉，引体从 5 个变 2 个。","保鲜膜、利尿剂、泻药突击掉秤：抽血会露馅，而且危险。","断碳水减重：一周掉 3 kg，掉的是水和糖原，恢复饮食立刻反弹。"]}],"box":"BMI ≥ 28 的人，建议提前自己查一次空腹血糖和糖化血红蛋白，心里有底。一周瘦十斤这种话，听听就行。"},{"name":"2kg 实心球投掷","tag":"五维四型体能项目，看距离；出手角度和技术占大头","shop":"作者的抖音橱窗里有对应的训练器材，按需购买即可，有需要的可以支持一下，在别处买的也一样能练。","sections":[{"t":"为什么你投不远","ps":["距离大致由出手速度和出手角度决定，角度落在 35°–45° 之间最远，个子高、手臂长的可以略低。很多人不是力气小，而是“只用手臂”——腿、髋、核心的力根本没传上来。","正确的顺序是蹬地 → 转髋 → 送肩 → 伸肘 → 拨腕，像鞭子一节节甩出去。任何一节提前发力，力就断在那里。"]},{"t":"两个练习就够用","ol":["药球砸地：双手举球过顶，全力向地面砸，3 组 × 8 次。这是最接近“整条链发力”的动作。","跪姿投掷：跪着只用手臂投，3 组 × 6 次，先把手臂动作练顺。"]},{"t":"力量那部分","ps":["站姿全力投 5 次 × 5 组，组间完全休息 2–3 分钟——投掷练的是质量，不是次数。配合壶铃高翻 3 组 × 6 次练髋部爆发，平板支撑 3 组 × 40 秒稳住核心。"]},{"t":"考前","ps":["停掉大重量，每天 3–5 次全力投。每次用手机拍侧面慢动作，对比出手角度和肘部位置，靠画面调，别靠感觉。"]},{"ul":["出手前先屈肘：力断在肘，距离直接少一两米。","投完先迈脚：判犯规，成绩作废。","只练投不练腿：练一个月只涨几十厘米。"]}],"box":"腰不好的人慎做旋转投；落地注意周围没人。"},{"name":"坐位体前屈","tag":"柔韧项目，突击一周能涨 3–5 cm，但要拉到“紧而不痛”","shop":"作者的抖音橱窗里有对应的训练器材，按需购买即可，有需要的可以支持一下，在别处买的也一样能练。","sections":[{"ps":["推不远，通常不是“筋太短”。更常见的是三件事叠在一起：大腿后侧（腘绳肌）张力大、髋关节后侧关节囊紧、腰背不敢放松。只盯着大腿拉，效果有限。"]},{"t":"为什么 20 秒没用","ps":["拉伸有个门槛：单次保持 30 秒以上，肌梭的牵张反射才会适应，组织才真正被拉长；20 秒以内基本只是热身，拉开的幅度几分钟就回去了。宁可少做几组，也要每组够 30 秒。","进阶可以用 PNF（收缩—放松）：拉到紧的位置保持 20 秒，对抗用力 6 秒，再拉深一点，重复 3 次。这是康复里用得最多的方法，比单纯静态拉伸见效快。"]},{"t":"每天 10 分钟的安排","ol":["腘绳肌静态拉伸：坐姿单腿前屈，3 组 × 30 秒/侧。","泡沫轴滚大腿后侧：每侧 2 分钟，先把“硬块”滚开。","坐姿体前屈保持：3 组 × 30 秒，推到“紧但不痛”的位置停住。"]},{"t":"别忽略当天状态","ps":["柔韧是很吃状态的项目：睡不好、没热身、穿紧裤子，成绩能差 3 cm。考前一天别“硬压一把”，容易拉伤，当天反而更紧。考前慢跑 3 分钟 + 直腿摆动 + 两次轻推就够了。"]},{"ul":["弹振式下压：容易拉伤，拉完当天更紧。","憋气硬压：肌肉一紧张就对抗，越压越短。","只拉大腿后侧：小腿、臀部不放松，整体还是受限。"]}],"box":"腰椎间盘突出、骶髂关节不稳的人不要做大幅度前屈；有腰部不适先问医生。"},{"name":"跳绳（1 分钟计数）","tag":"五维四型体能项目，1 分钟计数，拼的是节奏和耐力","shop":"作者的抖音橱窗里有对应的训练器材，按需购买即可，有需要的可以支持一下，在别处买的也一样能练。","sections":[{"ps":["一分钟跳绳就是高频小弹跳加手腕转速，拼的是心肺和踝、小腿的耐力。跳一次腾空 5 cm 和腾空 2 cm，一分钟下来能量差三成——这就是为什么有人后 30 秒直接崩。"]},{"t":"手腕转，不是大臂抡","ps":["大臂抡绳，半分钟就酸；手腕转，能撑满一分钟。绳长调法：单脚踩绳中间，绳柄到腋下。跳的时候脚离地 2–3 cm 就够，落地屈膝缓冲。"]},{"t":"三周怎么练","ol":["第一周：30 秒 × 6 组，组间休 30 秒，目标是把每组次数练稳。","第二周：45 秒 × 5 组、60 秒 × 4 组，组间休 60 秒。","第三周：每周挑一天做一次全力 1 分钟，其余日子只做 2–3 组，考前两天完全休息。"]},{"t":"容易被忽略的两件事","ps":["鞋要有缓冲，别在水泥地上硬跳；膝踝有旧伤或体重偏大的，先把量减半再慢慢加。"]},{"ul":["用大臂抡绳：半分钟就酸。","跳太高：看着努力，实际浪费体力。","跳绳太长或太短：老绊脚，节奏全乱。"]}],"box":"考场用的是统一配发的绳，长度、轻重可能和你平时练的不一样，有条件提前找一根接近的适应一两次。"},{"name":"肺活量","tag":"五维体质项，仪器读数，越高越好","shop":"作者的抖音橱窗里有对应的训练器材，按需购买即可，有需要的可以支持一下，在别处买的也一样能练。","sections":[{"ps":["肺活量大约七成由身高和胸廓决定，训练能提升 5%–15%，翻倍是不现实的。但吹气这个动作本身有技术，同一副肺，吹法不同，读数能差好几百。"]},{"t":"吹的三段式","ps":["起吹要稳，中段要匀，最后用腹肌把余气一点一点挤出去。很多人一口气猛吹，气流太快，仪器读数反而低；憋太久再吹，头昏、手麻，成绩也上不去。"]},{"t":"呼吸肌也是肌肉","ps":["真正的提升来自两处：一是膈肌和肋间肌的耐力，二是胸腔的顺应性。腹式呼吸（吸 4 秒、屏 2 秒、呼 6 秒）每天 3 组 × 10 次；吹气球每天 3 组 × 5 次，每次都吹到最大。","有氧底子也帮忙：每周 2 次 400 米 × 4 的间歇，或者游泳 20 分钟，练的是“憋着气还要用力”的能力。"]},{"t":"考前","ps":["只做技术：站直、双手叉腰、匀速吹，每天 3 次完整模拟。别跑着去考场，先静坐 2 分钟。"]},{"ul":["一口气猛吹：气流太快，读数低。","吹前过度换气：头晕、手麻，反而吹不好。","哮喘、气胸病史还练屏气：先问医生。"]}],"box":"这四项（腹式呼吸、吹气球、间歇、技术）练四周，大多数人能看到 200–500 ml 的变化。"},{"name":"立定跳远","tag":"五维四型体能项目，双脚原地同时起跳，落地不能后坐","shop":"作者的抖音橱窗里有对应的训练器材，按需购买即可，有需要的可以支持一下，在别处买的也一样能练。","sections":[{"t":"生物力学上发生了什么","ps":["起跳时，髋、膝、踝三关节同时伸展，力通过地面反作用传上来，手臂在最后 0.1 秒向前上摆，把水平速度再抬一截。技术好的人，同样的力量能多跳 10–15 cm。","最常见的错误是“先蹲后摆”：先蹲下去，手臂才往后甩，两个动作错开了，力就散了。正确的是一边下蹲、一边后摆，同时完成。"]},{"t":"练什么","ol":["深蹲跳 3 组 × 8 次，落地要轻。","摆臂练习：原地，手臂从后摆到前上，3 组 × 10 次，只练摆臂。","立定跳 5 次 × 3 组，每次全恢复——跳的是质量，不是数量。","箱上跳 3 组 × 6 次，练爆发；单腿硬拉 3 组 × 8 次/侧，练落地稳定。"]},{"t":"落地这一下","ps":["起跳角度大约 30°–40° 最远，不是越高越好。落地要屈膝屈髋缓冲，直腿砸地既伤膝，又容易向后坐判犯规。"]},{"ul":["起跳前手臂后摆不够：少了 10 cm 的初速度。","只看远度不看角度：有力量却跳得平。","考前两天还在练腿：跳完发软，成绩反而差。"]}],"box":"体重大的先减重再练跳；场地要平整，别在水泥地上做箱上跳。"},{"name":"平衡力（闭眼单脚站立）","tag":"五维体质项，测前庭和本体感觉，不是比谁站得久","sections":[{"ps":["睁眼时大脑有视觉帮忙，闭眼后只能靠前庭和踝关节的本体感觉——这才是体检要测的东西。所以练平衡，练的不是“意志力”，是踝周小肌肉的反应速度，和前庭对晃动的适应。"]},{"t":"光脚练，效果差一倍","ps":["鞋底越厚，脚底收到的信息越少。练的时候光脚、在硬地面或软垫上，效果比穿鞋好得多。身体不要大幅晃着找平衡，正确的是脚趾轻抓地、膝盖微屈、重心压在脚掌中间，靠微调。"]},{"t":"渐进四步","ol":["睁眼单脚站 3 组 × 30 秒/侧。","闭眼单脚站（扶墙）3 组 × 15 秒/侧。","闭眼单脚站（不扶）3 组 × 30 秒/侧。","软垫上单脚站 3 组 × 20 秒/侧，再加单腿硬拉 3 组 × 8 次。"]},{"ul":["脚趾死抓地：很快酸，撑不久。","穿厚底鞋练：脚感全错。","旁边没有可扶的东西就闭眼练：容易摔。"]}],"box":"眩晕症、耳石症发作期别练。"},{"name":"1000 米跑（女 800 米）","tag":"五维体能项目，提分靠间歇和配速","sections":[{"ps":["1000 米比的是“能以接近最大摄氧量的强度撑多久”。所以训练核心不是慢跑五公里，而是间歇——这也是挪威那套 4×4（4 分钟高强度、3 分钟恢复，重复 4 次）在耐力项目里流行的原因：同样时间，它对最大摄氧量的刺激比匀速跑强得多。对中学生来说，把 4 分钟换成 400 米 × 6 组，效果类似。"]},{"t":"配速比体能更容易丢分","ps":["最常见的崩盘是前 200 米冲太猛，600 米后开始走。正确的前 200 米应该略慢于目标配速，中间匀速，最后 150 米再冲。呼吸用“两步一吸、两步一呼”，固定节奏，别乱。"]},{"t":"六周安排","ol":["第 1–2 周：轻松跑 20 分钟 × 3 次/周，速度是能边跑边说话。","第 3–6 周：400 米 × 6 组，每组比目标配速快 5 秒，组间慢走 90 秒；每周加 1 次力量（深蹲、弓步、核心）。","考前 10 天减量到平时一半，考前 3 天只做 2×400 米放松跑。"]},{"ul":["起跑就冲：后程必崩。","考前一周加量：越练越累，成绩反而掉。","穿新鞋上考场：磨脚、打滑。"]}],"box":"目标配速按“现在成绩减 20 秒”定，别一上来就盯着满分线。"},{"name":"O 型腿（膝内翻）","tag":"体检看两膝间距：>7 cm 不合格，条件兵 >4 cm","sections":[{"ps":["成年以后骨骼已经定型，训练改变不了股骨和胫骨的角度，市面上卖的“矫正带”“矫正器”对成年人没有可靠证据。","训练能改善的是另一件事——臀中肌力量、踝背屈、走路姿势。练好了，腿在动态中不再内扣，膝盖不容易疼，走路也稳。目标要写清楚：不是“掰直”，是“用得对”。"]},{"t":"三个动作，练臀中肌","ol":["侧卧抬腿：3 组 × 15 次/侧，抬到最高停 1 秒。","蚌式：3 组 × 15 次/侧，脚跟并拢、膝盖打开。","弹力带侧向走：3 组 × 12 步，膝盖始终朝前。"]},{"t":"步态比动作更重要","ps":["每天对镜走 5 分钟，刻意让膝盖对准第二脚趾。深蹲时如果膝盖内扣，宁可不蹲那么深，也别练错模式。"]},{"ul":["只绑带不练肌肉：绑完更松。","深蹲膝盖内扣：越练越糟。","指望练直：期望错了，容易半途而废。"]}],"box":"间距明显超过 10 cm，或膝盖有疼痛，去骨科拍片评估，别自己硬练。"},{"name":"下蹲不全","tag":"体检要求双脚并拢蹲到底（允许分开不超肩宽）","sections":[{"ps":["蹲不下去，最常见的原因不是腿没劲，而是踝关节背屈不够——小腿三头肌太紧，膝盖没法往前送。第二个原因是髋屈肌紧、臀肌无力。顺序错了，练多久都没用：先开踝，再练蹲。","自测很简单：面墙站立，脚尖离墙 10 cm，膝盖往前顶墙、脚跟不离地。能顶到，说明踝够用；顶不到，问题就在这。"]},{"t":"开踝两周","ol":["靠墙踝背屈：3 组 × 20 次/侧。","小腿泡沫轴：每侧 2 分钟，重点滚腓肠肌。","脚跟垫高深蹲：3 组 × 10 次，先建立“能蹲到底”的感觉。"]},{"t":"再练蹲","ol":["扶物全蹲保持：3 组 × 30 秒，脚跟着地。","哥布林蹲（双手抱重物）：3 组 × 10 次。","髋屈肌拉伸：每侧 30 秒 × 3。"]},{"ul":["一上来就负重：身体会用塌腰、脚跟离地来代偿。","只拉小腿不练踝活动度：拉完还是蹲不下。","蹲的时候脚跟抬起：练的是假动作。"]}],"box":"臀肌挛缩、跟腱短这类病理性原因，练没用，要去医院评估。"},{"name":"扁平足（足弓塌陷）","tag":"体检只淘汰“足底弓完全消失”的重度扁平足","sections":[{"ps":["先分清两种：站着塌、一踮脚足弓就出来的，是柔性扁平足，能练；踮脚也不出弓的，是僵硬性扁平足，训练改变不了结构，只能靠鞋垫缓解，严重的要就医。","柔性扁平足的逻辑是：足内在肌（脚底那层小肌肉）和胫后肌撑不住内侧纵弓。近年 RCT 的网络 meta 分析里，胫后肌强化 + 足内在肌训练 + 小腿拉伸的组合，对成人柔性扁平足的症状改善最稳定。"]},{"t":"三个动作","ol":["短足练习（short foot）：足弓主动收缩、脚趾不蜷，保持 5 秒，3 组 × 10 次。这是足内在肌训练里证据最多的一个。","足趾抓毛巾：3 组 × 15 次。","提踵、单脚提踵：各 3 组 × 15 次，练胫后肌。"]},{"t":"鞋这件事","ps":["换有足弓支撑的鞋，别长时间穿软塌的板鞋。矫形鞋垫能缓解症状，但别指望它“把足弓撑回来”。没有疼痛的扁平足，不需要治疗。"]},{"ul":["只练不提踵：胫后肌没练到。","赤足跑量一下加太多：足底筋膜炎。","迷信分趾器、矫正鞋：只能缓解，不能复位。"]}],"box":"足弓完全消失且有疼痛，去骨科。训练目标是“能主动抬起足弓”，不是练成高足弓。"},{"name":"肘外翻","tag":"体检标准：外翻超过 20 度不合格","sections":[{"ps":["肘关节本来就有一个 10°–15° 的携带角，这是正常的。超过 15° 叫外翻，超过 20° 不合格。这个角度由骨骼决定，训练改不了——和 O 型腿一样，先把预期放正。","另外要分清：很多人被说“外翻”，其实是肘过伸（关节向后反张），两者的练法完全不同。"]},{"t":"能练的是什么","ps":["肘周肌肉的稳定性，以及“发力时不靠锁死关节”的习惯。肱二头肌等长收缩（肘屈 90°，用力 20 秒 × 3 组）、腕屈伸 3 组 × 15 次、弹力带前臂内旋外旋 3 组 × 15 次，都属于低风险、能长期做的。推类动作一律保持肘微屈。"]},{"ul":["硬掰肘关节：可能伤韧带。","大重量锁死肘：加重过伸。","把小指发麻当成体态问题：可能是尺神经受压，要就医。"]}],"box":"角度接近 20° 的，去医院量一次准确角度，别自己拿量角器估。"},{"name":"拇外翻","tag":"大脚趾向外偏、内侧骨性隆起，影响走路","sections":[{"ps":["主因是鞋头太窄加上遗传。脚趾长期被挤，第一跖骨内移、大脚趾外偏，内侧骨头凸出来。所以第一步永远是换鞋，不是买器械。","分趾垫、矫形器能缓解症状、减慢进展，但没有证据能把角度“掰回去”；手术是唯一能改变结构的方式，是否要做由骨科评估。"]},{"t":"日常能做的","ol":["换宽头鞋，停穿尖头鞋和高跟鞋。","足趾抓毛巾 3 组 × 15 次，练足内在肌。","拇趾外展：用手把大脚趾往外带，保持 10 秒，3 组 × 10 次。","弹力带分趾 3 组 × 15 次。"]},{"ul":["指望分趾器矫正角度。","疼的时候硬练：先消炎。","只练不换鞋：白练。"]}],"box":"疼痛明显、影响行走、角度很大的，去骨科评估是否需要手术。"},{"name":"轻微肘过伸","tag":"体检标准：过伸超过 15 度不合格","sections":[{"ps":["过伸是韧带松弛加上伸肌力量不足共同造成的。它常和“关节松弛体质”一起出现——手指能反压、膝盖也过伸的人，肘往往同样。","训练目标不是把角度练小，而是学会“不用锁死肘也能发力”。靠骨头和韧带硬顶的人，迟早会疼。"]},{"t":"练离心控制","ol":["肱二头肌等长：肘屈 150°（差一点伸直），保持 20 秒 × 3 组。","离心弯举：3 秒慢慢放下，3 组 × 8 次。","俯卧撑：肘微屈，3 组 × 10 次。"]},{"ul":["拉伸肘关节：越拉越松。","卧推锁死肘：加重过伸。","反复脱位还硬练：先看骨科。"]}],"box":"关节松弛明显、反复脱位或疼痛的，去医院评估，别自己练。"},{"name":"血压偏高调理","tag":"体检合格线：收缩压 90–139、舒张压 60–89 mmHg","sections":[{"ps":["年轻人的血压偏高，多数是三个原因叠在一起：吃盐多、体重超标、熬夜。这三件都能改，而且改起来见效不慢。"]},{"t":"数据大概是这样","ps":["DASH-Sodium 试验里，把钠从每天约 3400 mg 降到 1500 mg，配合 DASH 饮食（多蔬果、低脂奶、少红肉），收缩压平均能降 5–11 mmHg；单是减重，每减 1 kg 大约降 1 mmHg；每周 150 分钟有氧，再降 5–8 mmHg。三件事一起做，效果叠加。","还有一条容易被忽略：白大衣高血压。体检时紧张，血压瞬间能高 10–20 mmHg，所以“测前静坐 5 分钟”比吃什么保健品都管用。"]},{"t":"八周安排","ol":["第 1 周：连续 3 天记录饮食里的盐（酱油、咸菜、外卖都算）。","第 2–8 周：每周 5 次有氧、每次 30 分钟；限盐到 5 g/天以下；补钾（香蕉、菠菜、土豆）；超重的同步减重。","家里备个电子血压计，每周固定时间测 2 次，记录趋势。","体检前 3 天：不熬夜、不喝咖啡浓茶、不剧烈运动；当天提前到，静坐 5 分钟。"]},{"ul":["测前屏气：血压反而更高。","跑着去体检：第一遍肯定高。","自己吃降压药不告诉医生：问诊时会出问题。"]}],"box":"连续多次 ≥140/90，或伴头晕头痛，去心内科，别自己扛。"},{"name":"文身清除","tag":"面颈部及裸露部位 >3 cm、其他部位 >10 cm 不合格","sections":[{"ps":["文身这道坎卡的是尺寸和位置，跟训练没关系。体检看的是文身的长径和位置：面颈部、着军队制式体能训练服裸露的部位按 3 cm 算，其他部位按 10 cm 算。超过就不合格。"]},{"t":"能不能洗掉","ps":["能，靠激光。特定波长的光把色素颗粒打碎，再由免疫系统慢慢带走。一次只能清一部分，深色、面积大的要好几次。这也是为什么它急不得。"]},{"t":"时间怎么算","ps":["常规是每 6–8 周一次，因为皮肤要时间代谢色素、修复；间隔太短容易留疤，而疤本身也可能不合格。6–10 次治疗，加上最后一次之后 3 个月的观察期，至少要提前 1–2 年规划。","强烈建议去正规医院皮肤科或医疗美容机构，别去美容院用酸、用药水“洗”——那必然留疤，反而更麻烦。"]},{"t":"治疗期间","ul":["每次治疗后 2 周严格防晒，不搓洗、不抠痂。","出现水泡、感染迹象及时复诊。","瘢痕体质的人提前告诉医生，可能要换方案。"]}],"box":"最后一次治疗后再等 3 个月，确认没有明显瘢痕再体检。"},{"name":"视力保护","tag":"裸眼视力是硬指标，近视不可逆","sections":[{"ps":["近视是眼轴变长，不可逆。任何号称“恢复视力”的训练、仪器、按摩，都没法让眼轴缩回去。能做的只有两件：防加深，和手术矫正。"]},{"t":"防加深，证据最足的是户外","ps":["多项 meta 分析（包括针对儿童青少年的系统评价）显示，每天户外 2 小时左右，能显著降低近视发生和进展的风险，机制和自然光刺激多巴胺释放有关。这一条比任何眼保健操都管用。","其次是近距离用眼的节奏：20-20-20，每 20 分钟看 6 米外 20 秒；读写距离 33 cm，光线从左前方来。"]},{"t":"手术这条路","ps":["激光手术要求满 18 岁、度数稳定 2 年、角膜厚度 ≥480 μm，术后还要满半年才能体检。也就是说，如果打算做，高一高二就得开始规划，别等大四。"]},{"ul":["指望眼保健操恢复视力：只能缓解疲劳。","考前熬夜刷手机：度数涨得最快。","术后不到半年去体检：直接不合格。"]}],"box":"想做手术的，先去医院查角膜厚度和度数稳定性；体检标准以当年公告为准。"}];

const TRAIN_GROUPS = [
  { title: "五维四型 · 体能训练", keys: ["实心球", "坐位体前屈", "跳绳", "肺活量", "立定跳远", "平衡力", "1000", "体重"] },
  { title: "体检矫正", keys: ["O 型腿", "下蹲", "扁平足", "肘外翻", "拇外翻", "肘过伸", "血压", "文身", "视力"] }
];
function renderTrain() {
  const el = document.getElementById('train-list');
  const used = new Set();
  let html = "";
  TRAIN_GROUPS.forEach(g => {
    const items = [];
    g.keys.forEach(k => {
      TRAIN_PLANS.forEach((p, i) => {
        if (used.has(i)) return;
        if (p.name.indexOf(k) >= 0) { used.add(i); items.push({ p: p, i: i }); }
      });
    });
    if (!items.length) return;
    html += `<div class="train-group-title">${esc(g.title)}<span>${items.length} 项</span></div>`;
    html += items.map((it, k) =>
      `<div class="list-item" onclick="openTrainDetail(${it.i})">` +
      `<div class="item-index">${k + 1}</div>` +
      `<div class="item-content"><div class="item-title">${esc(it.p.name)}</div>` +
      `<div class="item-sub">${esc(it.p.tag)}</div></div>` +
      `<div class="te-arrow" style="flex:0 0 auto;">›</div></div>`).join("");
  });
  // 兜底：没归进任何组的条目单独列出，避免漏条目
  const rest = TRAIN_PLANS.map((p, i) => ({ p: p, i: i })).filter(it => !used.has(it.i));
  if (rest.length) {
    html += `<div class="train-group-title">其他<span>${rest.length} 项</span></div>`;
    html += rest.map((it, k) =>
      `<div class="list-item" onclick="openTrainDetail(${it.i})">` +
      `<div class="item-index">${k + 1}</div>` +
      `<div class="item-content"><div class="item-title">${esc(it.p.name)}</div>` +
      `<div class="item-sub">${esc(it.p.tag)}</div></div>` +
      `<div class="te-arrow" style="flex:0 0 auto;">›</div></div>`).join("");
  }
  el.innerHTML = html;
}
function openTrain() { navigate('train'); }
function openTrainDetail(i) { state.trainIndex = i; navigate('traindetail'); }
function renderTrainDetail() {
  const p = TRAIN_PLANS[state.trainIndex] || TRAIN_PLANS[0];
  document.getElementById('td-title').textContent = p.name;
  let h = `<div class="td-tag">${esc(p.tag)}</div>`;
  (p.sections || []).forEach(sec => {
    if (sec.t) h += `<h4>${esc(sec.t)}</h4>`;
    (sec.ps || []).forEach(x => { h += `<p>${esc(x)}</p>`; });
    if (sec.ol) h += `<ol class="td-steps">` + sec.ol.map(x => `<li>${esc(x)}</li>`).join("") + `</ol>`;
    if (sec.ul) h += `<ul class="td-mistakes">` + sec.ul.map(x => `<li>${esc(x)}</li>`).join("") + `</ul>`;
  });
  if (p.shop) h += `<div class="td-shop">${esc(p.shop)}</div>`;
  if (p.box) h += `<div class="td-note">${esc(p.box)}</div>`;
  //h += `<p class="train-invite">有更合适的练法或发现哪里不对，抖音搜「一粒麦子」找作者聊聊。</p>`;
  document.getElementById('td-body').innerHTML = h;
}

function navigate(view, replace) {
  showView(view);
  if (replace) history.replaceState({ view: view }, "");
  else history.pushState({ view: view }, "");
}
/* showView：只切换显示，不改动浏览历史（popstate 程序内后退时使用） */
function showView(view) {
  stopTimers();
  window.scrollTo(0, 0);
  state.view = view;
  /* 考试中隐藏顶部导航，避免误点"我的/关于"把整场考试丢掉 */
  document.body.classList.toggle("in-exam", view === "exam" || view === "transition");
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  const el = document.getElementById("view-" + view);
  if (el) el.classList.add("active");
  document.querySelectorAll(".nav-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.view === view));
  if (view === "home") renderHome();
  if (view === "mine") renderMine();
  if (view === "wrong") renderWrong();
  if (view === "favorites") renderFavorites();
  if (view === "history") renderHistory();
  if (view === "stats") renderStats();
  if (view === "settings") renderSettings();
  if (view === "about") renderAbout();
  if (view === "review") renderReview();
  if (view === "calc") resetCalcResult();
  if (view === "train") renderTrain();
  if (view === "traindetail") renderTrainDetail();
}
/* 顶部 Logo：考试中先确认退出，不能直接跳走 */
function goHome() {
  if (state.view === "exam" || state.view === "transition") { confirmExit(); return; }
  navigate("home");
}
/* 系统返回键（Android 物理/手势返回）处理 */
window.addEventListener("popstate", (e) => {
  const current = state.view;
  const target = e.state && e.state.view;
  // 0.5) 章节锚点引起的 hash 变化：交给浏览器自己滚，不当作返回键处理
  if (!target && location.hash.indexOf("#policy-") === 0) return;
  // 0) 有弹窗时，返回键先关弹窗，页面不后退
  if (document.getElementById("modal").classList.contains("show")) {
    closeModal();
    history.pushState({ view: current }, "");
    return;
  }
  // 1) 考试中 / 模块过渡页：先恢复历史，再走"退出确认"，确认才退出
  if (current === "exam" || current === "transition") {
    history.pushState({ view: current }, "");
    confirmExit();
    return;
  }
  // 2) 普通页面：程序内后退到目标页
  if (target) { showView(target); return; }
  // 3) 已到最早页面，再按会退出：确认一下
  if (confirm("确定要退出考试系统吗？")) {
    history.back();
  } else {
    history.pushState({ view: current }, "");
  }
});

/* 体检标准章节锚点：页内平滑滚动，不进入历史栈（否则会触发下面的返回键逻辑） */
document.addEventListener("click", (e) => {
  const a = e.target.closest && e.target.closest('a[href^="#policy-"]');
  if (!a) return;
  const el = document.getElementById((a.getAttribute("href") || "").slice(1));
  if (!el) return;
  e.preventDefault();
  el.scrollIntoView({ behavior: "smooth", block: "start" });
});

/* ============ 首页 ============ */
/* 征兵报名倒计时：男兵春季报名 12 月 1 日开放，2 月 10 日截止 */
function renderCountdown() {
  const daysEl = document.getElementById("cd-days");
  const titleEl = document.getElementById("cd-title");
  const subEl = document.getElementById("cd-sub");
  if (!daysEl || !titleEl) return;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const y = now.getFullYear();
  let start = new Date(y, 11, 1);
  let end = new Date(y + 1, 1, 10, 23, 59, 59);
  if (now > end) {
    start = new Date(y + 1, 11, 1);
    end = new Date(y + 2, 1, 10, 23, 59, 59);
  }
  const year = start.getFullYear() + 1;
  const MS = 86400000;
  if (now >= start && now <= end) {
    titleEl.textContent = year + " 年上半年征兵 · 报名进行中";
    daysEl.textContent = Math.max(0, Math.ceil((end - now) / MS));
    if (subEl) subEl.textContent = "距报名截止还剩 · 以全国征兵网为准";
  } else {
    titleEl.textContent = "距 " + year + " 年上半年征兵报名还有";
    daysEl.textContent = Math.max(0, Math.ceil((start - today) / MS));
    if (subEl) subEl.textContent = "男兵 12 月 1 日开放 · 女兵 1 月 1 日 · 以全国征兵网为准";
  }
}
function renderHome() {
  renderCountdown();
  document.getElementById("stat-exams").textContent = state.history.length;
  document.getElementById("stat-wrong").textContent = state.wrong.length;
  const avg = state.history.length
    ? Math.round(state.history.reduce((s, e) => s + e.score, 0) / state.history.length) : 0;
  document.getElementById("stat-avg").textContent = avg + "%";
  const td = state.daily[todayStr()];
  document.getElementById("stat-today").textContent = td ? td.count : 0;
  renderYiqian();
  renderTijian();
  renderCategories();
}

function renderYiqian() {
  const sys = EXAM_SYSTEMS.yiqian;
  let html = "";
  sys.modules.forEach(m => {
    const meta = m.parts
      ? m.parts.map(p => `<span class="entry-tag tag-parts">${p.name}${p.count}题</span>`).join("")
      : `<span class="entry-tag tag-total">${m.count}题</span>`;
    html += `<div class="entry-card" onclick="startSingle('yiqian','${m.key}')">
      <div class="entry-name">${m.name}</div>
      <div class="entry-meta">${meta}<br><span class="entry-tag tag-total">限时${m.minutes}分钟</span></div>
      <button class="entry-btn">单科模考</button></div>`;
  });
  html += `<div class="entry-card fullset" onclick="startFullSet('yiqian')">
    <div class="entry-name">整套连考</div>
    <div class="entry-meta">心理250题 + 职业200题<br><span class="entry-tag tag-total">心理：打分50 / 情境100 / 迫选100 · 限时60分钟</span></div>
    <button class="entry-btn">开始整套</button></div>`;
  document.getElementById("yiqian-grid").innerHTML = html;
}

function renderTijian() {
  const sys = EXAM_SYSTEMS.tijian;
  let html = "";
  sys.modules.forEach(m => {
    html += `<div class="entry-card" onclick="startSingle('tijian','${m.key}')">
      <div class="entry-name">${m.name}</div>
      <div class="entry-meta"><span class="entry-tag tag-per">${m.count}题</span><br><span class="entry-tag tag-per">每题10秒</span></div>
      <button class="entry-btn">单科模考</button></div>`;
  });
  html += `<div class="entry-card fullset" onclick="startFullSet('tijian')">
    <div class="entry-name">整套连考</div>
    <div class="entry-meta">言语100 + 数学100 + 人格300<br><span class="entry-tag tag-per">每题10秒</span></div>
    <button class="entry-btn">开始整套</button></div>`;
  document.getElementById("tijian-grid").innerHTML = html;
}

/* 专题训练科目表（按两场考试分组） */
const PRACTICE_ITEMS = {
  yq_psy: { label: "心理", groups: ["心理"], cats: ["强迫选择", "现象归因与反驳", "三选一情境"] },
  yq_calc: { label: "综合计算", groups: ["计算"], cats: ["数学", "物理", "化学"] },
  yq_speech: { label: "综合言语常识", groups: ["言语"],
    cats: ["成语辨析与运用", "诗词名句与文学常识", "选词填空与词语运用", "病句辨析",
      "错别字与语义重复", "修辞手法", "逻辑推理", "国防常识"] },
  tj_speech: { label: "言语", groups: ["言语"],
    cats: ["词义理解", "词语辨析与搭配", "语境选词", "句意理解"] },
  tj_math: { label: "数学", groups: ["计算"], cats: ["计算能力"] },
  tj_personality: { label: "心理人格", groups: ["人格"],
    cats: ["情绪管理", "人际关系", "抗压能力", "自我认知与自信心", "心理健康筛查",
      "效度检验", "正向心理验证", "五级量表"] }
};
function renderCategories() {
  const block = (ids, containerId) => {
    document.getElementById(containerId).innerHTML = ids.map(pid => {
      const it = PRACTICE_ITEMS[pid];
      return `<div class="cat-item" onclick="startPracticePool('${pid}')">
        <span class="cat-name">${it.label}</span></div>`;
    }).join("");
  };
  block(["yq_psy", "yq_calc", "yq_speech"], "cat-yiqian");
  block(["tj_speech", "tj_math", "tj_personality"], "cat-tijian");
}

/* ============ 我的（功能聚合） ============ */
function renderMine() {
  document.getElementById("mine-wrong-n").textContent = state.wrong.length;
  document.getElementById("mine-fav-n").textContent = state.favorites.length;
  document.getElementById("mine-exam-n").textContent = state.history.length;
  const items = [
    { icon: "📝", name: "错题本", meta: state.wrong.length + " 题", fn: "navigate('wrong')" },
    { icon: "⭐", name: "收藏夹", meta: state.favorites.length + " 题", fn: "navigate('favorites')" },
    { icon: "📊", name: "考试纪录", meta: state.history.length + " 场", fn: "navigate('history')" },
    { icon: "🩺", name: "体检标准", meta: "应征公民体格检查标准", fn: "navigate('policy')" },
    { icon: "📈", name: "学习统计", meta: "按考试 / 板块看正确率", fn: "navigate('stats')" },
    { icon: "⚙️", name: "设置", meta: "答题设置 / 数据备份", fn: "navigate('settings')" }
  ];
  document.getElementById("mine-grid").innerHTML = items.map(it =>
    `<div class="mine-card" onclick="${it.fn}">
      <div class="mc-icon">${it.icon}</div>
      <div class="mc-name">${it.name}</div>
      <div class="mc-meta">${it.meta}</div></div>`).join("");
}

/* ============ 题目构建 ============ */
function poolFor(groups, cats) {
  let qs = QUESTIONS.filter(q => groups.includes(q.group));
  if (cats && cats.length) qs = qs.filter(q => cats.includes(q.category));
  return qs;
}

function buildQuestions(systemKey, mc) {
  let qs = [];
  if (mc.parts) {
    mc.parts.forEach(p => {
      const pool = shuffleArray(poolFor(p.groups, p.cats));
      qs = qs.concat(pool.slice(0, p.count));
    });
  } else {
    const pool = shuffleArray(poolFor(mc.groups, mc.cats));
    qs = pool.slice(0, mc.count);
  }
  return qs;
}

/* ============ 开始考试 ============ */
function startSingle(systemKey, moduleKey) {
  const sys = EXAM_SYSTEMS[systemKey];
  const mc = sys.modules.find(m => m.key === moduleKey);
  setupExam({
    mode: "full", systemKey,
    title: sys.name + " · " + mc.name,
    configs: [mc], isFullSet: false
  });
}
function startFullSet(systemKey) {
  const sys = EXAM_SYSTEMS[systemKey];
  setupExam({
    mode: "full", systemKey,
    title: sys.name + " · 整套连考",
    configs: sys.modules, isFullSet: true
  });
}
function startPracticePool(pid) {
  const it = PRACTICE_ITEMS[pid];
  if (!it) return;
  let qs = poolFor(it.groups, it.cats);
  if (!qs.length) { alert("该板块暂无题目"); return; }
  // 每次进入专题训练都重新打乱顺序
  for (let k = qs.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    const t = qs[k]; qs[k] = qs[j]; qs[j] = t;
  }
  qs = qs.slice(0, 200);
  setupExam({
    mode: "practice", title: it.label + " 专题练习",
    direct: [{ name: it.label, questions: qs }]
  });
}
function retryWrong() {
  if (state.wrong.length === 0) { alert("错题本是空的"); return; }
  let qs = state.wrong.filter(q => sysOfId(q.id) === (state.wrongSys || "yiqian"));
  if (state.wrongFilter !== "all") qs = qs.filter(q => q.group === state.wrongFilter);
  if (qs.length === 0) { alert("当前筛选下没有错题"); return; }
  setupExam({
    mode: "wrong", title: "错题重练（" + qs.length + "题）",
    direct: [{ name: "错题", questions: qs.map(q => JSON.parse(JSON.stringify(q))) }]
  });
}
function practiceFavorites() {
  if (state.favorites.length === 0) { alert("收藏夹是空的"); return; }
  let qs = QUESTIONS.filter(q => state.favorites.includes(q.id) && sysOfId(q.id) === (state.favSys || "yiqian"));
  if (state.favFilter !== "all") qs = qs.filter(q => q.group === state.favFilter);
  if (qs.length === 0) { alert("当前筛选下没有收藏题"); return; }
  setupExam({
    mode: "favorites", title: "收藏复习（" + qs.length + "题）",
    direct: [{ name: "收藏", questions: qs }]
  });
}
function startMemorizeAll() {
  if (QUESTIONS.length === 0) return;
  setupExam({
    mode: "memorize", title: "背题模式（全部）",
    direct: [{ name: "全部", questions: QUESTIONS.slice() }]
  });
}

function setupExam(opt) {
  exam = {
    mode: opt.mode,
    title: opt.title,
    systemKey: opt.systemKey || null,
    isFullSet: !!opt.isFullSet,
    modules: [],
    moduleIndex: 0,
    moduleResults: [],
    perLeft: {}
  };
  if (opt.direct) {
    exam.modules = opt.direct.map(d => ({
      name: d.name, questions: d.questions,
      answers: new Array(d.questions.length).fill(null),
      start: null
    }));
  } else {
    exam.modules = opt.configs.map(mc => ({
      name: mc.name, config: mc,
      questions: buildQuestions(opt.systemKey, mc),
      answers: [],
      start: null
    }));
    // 题池充足性检查：不足则提示并中止，不启动空考试
    for (const m of exam.modules) {
      const mc = m.config;
      const need = mc.count ||
        mc.parts.reduce((s, p) => s + p.count, 0);
      if (m.questions.length < need) {
        alert("「" + m.name + "」题池不足：需要 " + need + " 题，当前题库只有 " +
          m.questions.length + " 题。请先导入更多题目。");
        navigate("home", true);
        return;
      }
    }
    exam.modules.forEach(m => { m.answers = new Array(m.questions.length).fill(null); });
  }
  i = 0;
  navigate("exam");
  startModule();
}

function cm() { return exam.modules[exam.moduleIndex]; }

function startModule() {
  cm().start = Date.now();
  i = 0;
  fillFocusFor = -1;
  renderQuestion();
}

/* ============ 计时 ============ */
function stopTimers() {
  if (totalTimer) { clearInterval(totalTimer); totalTimer = null; }
  stopPerTimer();
}
function stopPerTimer() {
  if (perTimer) { clearInterval(perTimer); perTimer = null; }
  if (exam && exam.perLeft && perTimerFor >= 0) {
    exam.perLeft[perTimerFor] = perRemaining;
  }
  perTimerFor = -1;
}
function startTimers() {
  stopTimers();
  if (!exam.systemKey) return; // 非全真模式不限时
  const sys = EXAM_SYSTEMS[exam.systemKey];
  if (sys.timerType === "total") {
    totalRemaining = cm().config.minutes * 60;
    updateTotalTimer();
    /* 用截止时间计算，手机切后台/息屏被浏览器限流也不会算错时间 */
    const deadline = Date.now() + totalRemaining * 1000;
    totalTimer = setInterval(() => {
      totalRemaining = Math.max(0, (deadline - Date.now()) / 1000);
      updateTotalTimer();
      if (totalRemaining <= 0) {
        clearInterval(totalTimer); totalTimer = null;
        totalTimeUp();
      }
    }, 250);
  }
}
function updateTotalTimer() {
  const t = document.getElementById("exam-timer");
  t.textContent = fmtTime(Math.max(0, totalRemaining));
  t.classList.toggle("urgent", totalRemaining <= 300);
}
function startPerTimer() {
  stopPerTimer();
  const sys = EXAM_SYSTEMS[exam.systemKey];
  const idx = i;
  perTimerFor = idx;
  const secs = (cm().config && cm().config.seconds) || sys.perQuestion;
  if (exam.perLeft[idx] == null) exam.perLeft[idx] = secs;
  perRemaining = exam.perLeft[idx];
  updatePerTimer();
  const deadline = Date.now() + perRemaining * 1000;
  perTimer = setInterval(() => {
    if (i !== idx) { stopPerTimer(); return; }
    perRemaining = Math.max(0, (deadline - Date.now()) / 1000);
    exam.perLeft[idx] = perRemaining;
    updatePerTimer();
    if (perRemaining <= 0) {
      stopPerTimer();
      perTimeUp();
    }
  }, 100);
}
function updatePerTimer() {
  const sys = EXAM_SYSTEMS[exam.systemKey];
  const total = (cm().config && cm().config.seconds) || sys.perQuestion;
  const fill = document.getElementById("per-fill");
  const sec = document.getElementById("per-sec");
  if (!fill) return;
  const pct = Math.max(0, perRemaining / total * 100);
  fill.style.width = pct + "%";
  fill.className = "per-timer-fill " + (perRemaining <= 3 ? "danger" : perRemaining <= 6 ? "warn" : "");
  if (sec) sec.textContent = Math.ceil(Math.max(0, perRemaining));
}

/* ============ 渲染题目 ============ */
function isAnswered(q, a) {
  if (!a) return false;
  if (q.type === "fill") return !!a.judged;
  if (q.type === "rating") return !!(a.choice && Object.keys(a.choice).length >= 3);
  if (q.type === "forced") return !!(a.choice && a.choice.most && a.choice.least);
  return a.choice !== undefined && a.choice !== null && a.choice !== "";
}

function renderQuestion() {
  const m = cm();
  const q = m.questions[i];
  const a = m.answers[i];
  const memorizing = exam.mode === "memorize";
  const judged = a && a.judged;
  const showAnswer = judged || memorizing;
  const immediate = isImmediate();

  // 顶部
  const sys = exam.systemKey ? EXAM_SYSTEMS[exam.systemKey] : null;
  const modeEl = document.getElementById("exam-mode");
  let sub = "";
  if (exam.isFullSet) {
    sub = "模块 " + (exam.moduleIndex + 1) + "/" + exam.modules.length + " · " + cm().name;
  } else {
    sub = cm().name;
  }
  modeEl.innerHTML = exam.title + '<span class="sub">' + sub + '</span>';

  const t = document.getElementById("exam-timer");
  if (sys) {
    if (sys.timerType === "total") {
      t.textContent = fmtTime(Math.max(0, totalRemaining));
    } else {
      t.textContent = ((cm().config && cm().config.seconds) || sys.perQuestion) + "秒/题";
      t.classList.remove("urgent");
    }
  } else {
    t.textContent = "不限时";
    t.classList.remove("urgent");
  }

  // 标记按钮：只保留收藏
  const favOn = state.favorites.includes(q.id) ? " on fav" : "";

  let html = "";
  html += `<div class="question-meta">
    <span class="question-num">第${i + 1}题</span>
    <span class="question-category">${esc(q.group)}${q.category ? " · " + esc(q.category) : ""}</span>
    <span class="question-source">${esc(q.sourceName || "")}</span>
    <div class="mark-bar">
      <button class="mark-btn${favOn}" title="收藏" onclick="toggleMark('fav','${q.id}')">★</button>
    </div></div>`;

  // 每题倒计时（体检模式 + 未判）
  if (sys && sys.timerType === "perQuestion") {
    const qSecs = (cm().config && cm().config.seconds) || sys.perQuestion;
    const startSec = exam.perLeft[i] == null ? qSecs : exam.perLeft[i];
    const startPct = Math.max(0, Math.min(100, startSec / qSecs * 100));
    html += `<div class="per-timer-wrap">
      <div class="per-timer-label"><span>本题剩余时间</span><span><span id="per-sec">${Math.ceil(Math.max(0, startSec))}</span> 秒</span></div>
      <div class="per-timer-bar"><div class="per-timer-fill" id="per-fill" style="width:${startPct}%"></div></div></div>`;
  }

  if (q.type === "forced") {
    html += `<div class="forced-hint">迫选题：请分别选择一个【最符合】和一个【最不符合】的选项。</div>`;
  }
  if (q.type === "rating") {
    html += `<div class="forced-hint">打分题：请对 A、B、C 三个选项分别选择认同程度（最不认同 → 最认同），三个等级要有区分。计分按“接近程度”：完全一致得满分，差一档给一半分。</div>`;
  }
  if (q.type === "fill") {
    html += `<div class="forced-hint">填空题：在方框里直接输入结果的个位数字，输入后立即判分。</div>`;
  }

  if (q.type === "fill") {
    const parts = String(q.question).split("□");
    // 判完分仍然显示“用户自己填的数字”（超时则留空），避免把正确答案塞进框里造成“我明明填对了”的错觉
    const mineIn = (a && typeof a.choice === "string") ? a.choice : "";
    const val = memorizing ? String(q.answer) : mineIn;
    const inputCls = "fill-input" + (judged ? (a && a.correct ? " ok" : " bad") : "");
    html += `<div class="question-text">${esc(parts[0] || "")}<input class="${inputCls}" id="fill-input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="off" enterkeyhint="next" value="${esc(val)}" ${showAnswer ? "disabled" : ""} oninput="fillInput(this)">${esc(parts.slice(1).join("□"))}</div>`;
  } else {
    html += `<div class="question-text">${esc(q.question)}</div>`;
  }

  // 选项（填空题没有选项，整个容器都不渲染，避免留白）
  if (q.type === "rating") {
    html += `<div class="options-list">`;
    Object.entries(q.options).forEach(([letter, text]) => {
      const sc = (a && a.choice) || {};
      const ref = showAnswer ? q.answer.scores[letter] : null;
      let row = `<div class="option-item rating-item${showAnswer ? " disabled" : ""}">`;
      row += `<div class="option-letter">${letter}</div><div class="option-text">${esc(text)}`;
      if (showAnswer) row += `<span class="role-badge most">参考：${RATE_LABELS[ref - 1]}</span>`;
      row += `</div><div class="rate-row">`;
      for (let n = 1; n <= 5; n++) {
        const on = sc[letter] === n;
        row += `<button class="rate-btn${on ? " on" : ""}${showAnswer ? " disabled" : ""}" title="${n} 分" onclick="rateOption('${letter}',${n})">${RATE_LABELS[n - 1]}</button>`;
      }
      row += `</div></div>`;
      html += row;
    });
    html += `</div>`;
  } else if (q.type !== "fill") {
  html += `<div class="options-list">`;
  Object.entries(q.options).forEach(([letter, text]) => {
    let cls = "option-item";
    let inner = `<div class="option-letter">${letter}</div><div class="option-text">${esc(text)}`;
    if (q.type === "forced") {
      const pick = a && a.choice;
      if (showAnswer) {
        if (letter === q.answer.most) { cls += " correct"; inner += `<span class="role-badge most">最符合</span>`; }
        else if (letter === q.answer.least) { cls += " correct"; inner += `<span class="role-badge least">最不符合</span>`; }
        if (pick) {
          if (pick.most === letter && letter !== q.answer.most) cls = "option-item wrong";
          if (pick.least === letter && letter !== q.answer.least) cls = "option-item wrong";
        }
        cls += " disabled";
      } else {
        if (pick && pick.most === letter) { cls += " most-pick"; inner += `<span class="role-badge most">最符合</span>`; }
        else if (pick && pick.least === letter) { cls += " least-pick"; inner += `<span class="role-badge least">最不符合</span>`; }
      }
    } else {
      if (showAnswer) {
        if (letter === q.answer) cls += " correct";
        if (a && a.choice === letter && letter !== q.answer) cls += " wrong";
        cls += " disabled";
      } else if (a && a.choice === letter) {
        cls += " selected";
      }
    }
    inner += `</div>`;
    html += `<div class="${cls}" onclick="clickOption('${letter}')">${inner}</div>`;
  });
  html += `</div>`;
  }

  // 解析
  if (showAnswer) {
    html += buildExplanation(q, a, memorizing);
  }
  document.getElementById("question-card").innerHTML = html;

  // 填空题：新题自动聚焦输入框（在点击事件的同步流程里执行，手机端才会自动弹出数字键盘）
  if (q.type === "fill" && !showAnswer && fillFocusFor !== i) {
    fillFocusFor = i;
    const fillEl = document.getElementById("fill-input");
    if (fillEl) {
      try { fillEl.focus({ preventScroll: true }); } catch (e) { fillEl.focus(); }
      if (typeof fillEl.select === "function") fillEl.select();
    }
  }

  // 进度：只显示第几题，不暴露总题量；不限时的训练页连进度条也不显示
  const practiceMode = exam.mode !== "full";
  const pct = (i + 1) / m.questions.length * 100;
  document.getElementById("progress-fill").style.width = (practiceMode ? 0 : pct) + "%";
  document.getElementById("exam-progress").style.display = practiceMode ? "none" : "";
  document.getElementById("progress-text").textContent = "第 " + (i + 1) + " 题";

  // 按钮
  const btnNext = document.getElementById("btn-next");
  btnNext.textContent = i === m.questions.length - 1
    ? (exam.isFullSet && exam.moduleIndex < exam.modules.length - 1 ? "完成本模块" : "完成考试")
    : "下一题";
  btnNext.classList.toggle("ready", !!(a && a.timedOut));
  btnNext.disabled = !memorizing && !isAnswered(q, a) && !(a && a.timedOut);
  btnNext.classList.toggle("locked", btnNext.disabled);
  document.getElementById("btn-prev").style.display = i > 0 ? "inline-block" : "none";

  // 启动计时：每题倒计时只在换题时启动，标记/重绘不会重置
  if (sys && sys.timerType === "perQuestion") {
    if (!judged) {
      if (perTimerFor !== i || !perTimer) startPerTimer();
    } else {
      stopPerTimer();
    }
  } else {
    stopPerTimer();
  }
  if (sys && sys.timerType === "total" && !totalTimer) startTimers();
}

function buildExplanation(q, a, memorizing) {
  let head = "";
  if (memorizing) {
    head = `<span class="correct-answer">背题模式 · 直接看答案。</span> `;
  } else if (a.timedOut) {
    head = `<span class="timeout-tag">${exam.systemKey && EXAM_SYSTEMS[exam.systemKey].timerType === "perQuestion" ? "超时未答" : "时间到未答"}。</span> `;
  } else if (a.correct) {
    head = `<span class="correct-answer">回答正确！</span> `;
  } else {
    head = `<span style="color:var(--error);font-weight:700;">回答错误。</span> `;
  }
  let ansHtml = "";
  if (q.type === "forced") {
    ansHtml = `正确答案：<span class="correct-answer">最符合 ${q.answer.most}、最不符合 ${q.answer.least}</span>`;
  } else if (q.type === "rating") {
    const s = q.answer.scores;
    ansHtml = `参考：<span class="correct-answer">${Object.keys(s).map(k => k + " " + RATE_LABELS[s[k] - 1]).join("、")}</span>（每项与参考相差不超过一级算正确）`;
  } else if (q.type === "fill") {
    const mine = (a && typeof a.choice === "string") ? a.choice : "";
    ansHtml = `正确答案：<span class="correct-answer">${q.answer}</span>` +
      (memorizing ? "" : (mine ? ` ｜ 你填的是：<b>${esc(mine)}</b>` : ` ｜ <b>你这一题没有输入数字</b>`));
  } else {
    ansHtml = `正确答案：<span class="correct-answer">${q.answer}</span>`;
  }
  return `<div class="explanation-box show">
    <div class="explanation-title">答案解析</div>
    <div class="explanation-text">${head}${ansHtml}<br>${esc(q.explanation)}</div></div>`;
}

/* ============ 点击选项 ============ */
function clickOption(letter) {
  if (exam.mode === "memorize") return;   // 背题模式只看答案，不判分、不进错题本
  const m = cm();
  const a = m.answers[i];
  if (a && a.judged) return;
  const q = m.questions[i];
  const immediate = isImmediate();
  if (q.type === "rating") return;        // 打分题用 rateOption

  if (q.type === "single") {
    if (immediate) {
      judgeCurrent(letter);
    } else {
      m.answers[i] = { choice: letter, answered: true, judged: false };
      renderQuestion();
    }
    return;
  }

  // 双端迫选：点已选的取消；两槽都满时点第三个，替换先选的那个
  let rec = a || { choice: {}, answered: false };
  if (!rec.choice) rec.choice = {};
  if (!rec.order) rec.order = {};
  if (rec.choice.most === letter) {
    delete rec.choice.most; delete rec.order.most;
  } else if (rec.choice.least === letter) {
    delete rec.choice.least; delete rec.order.least;
  } else if (!rec.choice.most) {
    rec.choice.most = letter; rec.seq = (rec.seq || 0) + 1; rec.order.most = rec.seq;
  } else if (!rec.choice.least) {
    rec.choice.least = letter; rec.seq = (rec.seq || 0) + 1; rec.order.least = rec.seq;
  } else {
    const older = (rec.order.most || 0) < (rec.order.least || 0) ? "most" : "least";
    delete rec.choice[older];
    rec.choice[older] = letter;
    rec.seq = (rec.seq || 0) + 1; rec.order[older] = rec.seq;
  }
  rec.answered = !!(rec.choice.most || rec.choice.least);
  m.answers[i] = rec;
  if (immediate && rec.choice.most && rec.choice.least) {
    judgeCurrent();
  } else {
    renderQuestion();
  }
}

/* 打分题：对某个选项打 1-5 分 */
function rateOption(letter, score) {
  if (exam.mode === "memorize") return;
  const m = cm();
  const a = m.answers[i];
  if (a && a.judged) return;
  const q = m.questions[i];
  if (q.type !== "rating") return;
  let rec = a || { choice: {}, answered: false };
  rec.choice[letter] = score;
  rec.answered = Object.keys(q.options).every(L => rec.choice[L]);
  m.answers[i] = rec;
  if (rec.answered && isImmediate()) judgeCurrent();
  else renderQuestion();
}

/* 填空题：输入一位数字后立即判分（不自动跳题，用户自己点下一题） */
function fillInput(el) {
  if (exam.mode === "memorize") { el.value = ""; return; }
  const m = cm();
  const a = m.answers[i];
  if (a && a.judged) return;
  let v = normDigits(el.value).slice(-1);   // 先转半角再取个位，手机输入法打全角数字也不会被吃掉
  el.value = v;
  if (!v) return;
  judgeCurrent(v);
}

/* ============ 判定 ============ */
function normDigits(v) {
  // 全角数字转半角，再去掉空格等非数字，避免手机输入法打出「６」被判错
  let t = String(v == null ? "" : v);
  try { t = t.normalize("NFKC"); } catch (e) {}   // ４→4、④→4 等各家输入法的写法
  return t.replace(/\D/g, "");
}
/* 单题得分率 0~1：心理类按“接近程度”给分，不再全对/全错 */
function creditOf(q, choice) {
  if (!choice) return 0;
  if (q.type === "single") return choice === q.answer ? 1 : 0;
  if (q.type === "fill") return normDigits(choice) === normDigits(q.answer) ? 1 : 0;
  if (q.type === "rating") {
    const keys = Object.keys(q.answer.scores);
    let got = 0;
    keys.forEach(L => {
      if (!choice[L]) return;
      const d = Math.abs(Number(choice[L]) - Number(q.answer.scores[L]));
      got += d === 0 ? 1 : d === 1 ? 0.5 : 0;   // 同档满分，差一档给一半，差两档及以上不给分
    });
    const picks = keys.map(L => choice[L]).filter(v => v);
    if (picks.length === keys.length && new Set(picks).size === 1) got *= 0.5;  // 三个选项全选同一档，按敷衍作答折半
    return got / keys.length;
  }
  let got = 0;
  if (choice.most && choice.most === q.answer.most) got += 0.5;    // 最符合 / 最不符合 各占一半
  if (choice.least && choice.least === q.answer.least) got += 0.5;
  return got;
}
function checkCorrect(q, choice) { return creditOf(q, choice) >= 0.999; }
/* 心理类 15 项特质权重（核心 15 → 次要 1）：题干 + 三个选项一起比对关键词 */
const PSY_TRAITS = [
  { w: 15, k: ["忠诚", "组织安排", "跟党", "信念", "誓词", "服从组织"] },
  { w: 14, k: ["牺牲", "奉献", "吃苦", "抢着干", "脏活", "累活", "抢险", "抗洪", "救灾", "付出", "危险任务"] },
  { w: 13, k: ["勇敢", "危险", "担当", "血性", "冲在前", "挺身", "见义勇为", "责任"] },
  { w: 12, k: ["集体", "团队", "荣誉", "团结", "为班里", "全班"] },
  { w: 11, k: ["战友", "人际", "相处", "矛盾", "关系", "沟通", "冲突", "误会"] },
  { w: 10, k: ["诚实", "守信", "撒谎", "坦白", "诚信", "弄虚作假", "隐瞒", "说实话"] },
  { w: 9,  k: ["信任", "怀疑", "猜疑", "放心"] },
  { w: 8,  k: ["纪律", "规定", "制度", "违规", "条令", "内务", "请假", "外出"] },
  { w: 7,  k: ["领导", "班长", "上级", "首长", "命令", "指示", "批评"] },
  { w: 6,  k: ["自信", "信心", "底气", "紧张", "怯场"] },
  { w: 5,  k: ["乐观", "情绪", "消极", "开朗", "低落", "抱怨"] },
  { w: 4,  k: ["自律", "坚持", "偷懒", "放松要求", "手机", "游戏"] },
  { w: 3,  k: ["作息", "习惯", "卫生", "睡眠", "饮食", "身体"] },
  { w: 2,  k: ["钱", "消费", "财富", "借钱", "花钱"] },
  { w: 1,  k: ["能力", "技能", "本领", "专业"] }
];
function psychWeight(q) {
  if (!q || q.group !== "心理") return 1;
  const text = (q.question || "") + " " + Object.keys(q.options || {}).map(L => q.options[L]).join(" ");
  let best = 8, bestHit = 0;
  PSY_TRAITS.forEach(t => {
    let hit = 0;
    t.k.forEach(word => { if (text.indexOf(word) >= 0) hit++; });
    if (hit > bestHit || (hit === bestHit && hit > 0 && t.w > best)) { bestHit = hit; best = t.w; }
  });
  return best;
}
function judgeCurrent(forcedChoice) {
  const m = cm();
  const q = m.questions[i];
  let rec = m.answers[i];
  if (!rec) rec = { choice: forcedChoice || {}, answered: true };
  if (forcedChoice) rec.choice = forcedChoice;
  const credit = creditOf(q, rec.choice);
  rec.credit = credit;
  const correct = credit >= 0.999;
  rec.correct = correct;
  rec.judged = true;
  rec.answered = true;
  rec.timedOut = !!rec.timedOut;
  m.answers[i] = rec;
  stopPerTimer();
  if (credit < 0.6) addWrong(q, rec.choice, rec.timedOut);
  recordStat(q, correct);
  renderQuestion();
  if (correct && settings.autoNext && isImmediate() && q.type !== "fill") {
    clearTimeout(autoNextTimer);
    autoNextTimer = setTimeout(() => {
      autoNextTimer = null;
      if (state.view !== "exam") return;
      if (i < m.questions.length - 1) { i++; renderQuestion(); }
      else { finishModule(); }
    }, 800);
  }
}

/* ============ 超时 ============ */
function perTimeUp() {
  const m = cm();
  const q = m.questions[i];
  let rec = m.answers[i];
  stopPerTimer();
  if (rec && rec.judged) return;
  rec = rec || { choice: {} };
  rec.choice = rec.choice || {};
  rec.answered = false;
  rec.judged = true;
  rec.timedOut = true;
  rec.correct = false;
  rec.credit = 0;
  m.answers[i] = rec;
  // 超时没作答：不进错题本、不计做题量
  renderQuestion();
}

function totalTimeUp() {
  clearInterval(totalTimer);
  totalTimer = null;
  if (!exam) return;
  // 时间到：已选的题按实际选择判分，没选的题记为超时未答
  judgePendingInModule(cm(), true);
  finishModule(true);
}

/* ============ 题目翻页 ============ */
function nextQuestion() {
  clearTimeout(autoNextTimer);
  autoNextTimer = null;
  const m = cm();
  if (exam.mode !== "memorize" && !isAnswered(m.questions[i], m.answers[i]) && !(m.answers[i] && m.answers[i].timedOut)) return;
  if (i < m.questions.length - 1) {
    i++;
    renderQuestion();
  } else {
    finishModule();
  }
}
function prevQuestion() {
  clearTimeout(autoNextTimer);
  autoNextTimer = null;
  if (i > 0) { i--; renderQuestion(); }
}

/* 把模块里还没判的题统一判定（交卷 / 时间到 / 中途退出共用） */
function judgePendingInModule(m, isTimeUp) {
  m.questions.forEach((q, idx) => {
    const rec = m.answers[idx];
    if (rec && rec.judged) return;
    const choice = rec && rec.choice;
    const hasAnswer = q.type === "single" ? !!choice
      : q.type === "fill" ? !!choice
      : q.type === "rating" ? !!(choice && Object.keys(q.options).every(L => choice[L]))
      : !!(choice && choice.most && choice.least);
    if (hasAnswer) {
      const credit = creditOf(q, choice);
      const correct = credit >= 0.999;
      rec.correct = correct; rec.credit = credit; rec.judged = true; rec.answered = true; rec.timedOut = false;
      if (credit < 0.6) addWrong(q, choice, false);
      recordStat(q, correct);
    } else {
      // 没答：计入总分，但不进错题本、不影响分类正确率
      m.answers[idx] = { choice: {}, answered: false, judged: true, timedOut: !!isTimeUp, correct: false };
    }
  });
}

/* ============ 模块完成 ============ */
function finishModule(forced) {
  stopTimers();
  // 背题模式结束：直接回首页，不判分、不存纪录
  if (exam.mode === "memorize") { navigate("home", true); return; }
  const m = cm();
  if (m.finished) return;   // 防连点：同一模块只结算一次
  m.finished = true;

  // 全真模式交卷时，统一判定本模块还没判的题
  if (exam.mode === "full" && !settings.instant) judgePendingInModule(m, false);

  const result = calcModuleResult(m);
  exam.moduleResults.push(result);

  if (exam.isFullSet && exam.moduleIndex < exam.modules.length - 1) {
    renderTransition(result);
  } else {
    finalizeExam();
  }
}

function calcModuleResult(m) {
  const total = m.questions.length;
  let correct = 0, timedOut = 0, answered = 0, creditSum = 0, weightSum = 0;
  let doneCredit = 0, doneWeight = 0;   // 只统计“已作答”的题，用于中途退出时显示本次正确率
  m.answers.forEach((a, idx) => {
    const w = psychWeight(m.questions[idx]);
    weightSum += w;
    if (a) {
      if (a.correct) correct++;
      if (a.timedOut) timedOut++;
      if (a.answered) answered++;
      creditSum += (a.credit || 0) * w;
      if (a.answered) { doneCredit += (a.credit || 0) * w; doneWeight += w; }
    }
  });
  const elapsed = m.start ? Math.floor((Date.now() - m.start) / 1000) : 0;
  const wrongIds = m.questions.filter((q, idx) => {
    const a = m.answers[idx];
    return a && a.judged && a.answered && !a.correct;
  }).map(q => q.id);
  return {
    name: m.name, total, correct, wrongIds,
    wrong: total - correct, timedOut, answered,
    wrongAnswered: answered - correct, unanswered: total - answered,
    elapsed, score: Math.round(weightSum ? creditSum / weightSum * 100 : 0),
    scoreDone: Math.round(doneWeight ? doneCredit / doneWeight * 100 : 0)
  };
}

function renderTransition(result) {
  const nextMod = exam.modules[exam.moduleIndex + 1];
  const html = `<h2>「${result.name}」模块完成</h2>
    <div class="transition-score">${result.score}分</div>
    <div class="transition-stats">
      <span class="tstat">答对 <b>${result.correct}</b> 题</span>
      <span class="tstat">答错 <b>${result.wrong}</b> 题</span>
      <span class="tstat">超时/未答 <b>${result.timedOut}</b> 题</span>
      <span class="tstat">用时 <b>${fmtTime(result.elapsed)}</b></span>
    </div>
    <p style="font-size:13px;color:var(--text-light);margin-bottom:18px;">下一模块：「${nextMod.name}」（${nextMod.questions.length}题）</p>
    <button class="btn btn-primary" onclick="goNextModule()">开始下一模块</button>
    <button class="btn btn-secondary" style="margin-left:8px;" onclick="abortFullSet()">结束考试</button>`;
  document.getElementById("transition-card").innerHTML = html;
  navigate("transition", true);
}
function goNextModule() {
  exam.moduleIndex++;
  exam.perLeft = {};   // 换模块必须重置每题倒计时，否则会把上一模块同一题号的剩余秒数带过来
  i = 0;
  navigate("exam", true);
  startModule();   // renderQuestion 会按计时类型自动启动计时
}
function abortFullSet() {
  if (!confirm("确定结束整套连考？已完成 " + exam.moduleResults.length + " 个模块，未开始的模块不计入。")) return;
  exam.aborted = true;
  finalizeExam();
}

/* ============ 最终结果 ============ */
function finalizeExam(silent) {
  if (exam.finalized) return;   // 防重复结算（退出键 + 返回键叠加时）
  exam.finalized = true;
  const results = exam.moduleResults;
  if (!results.length) { navigate("home", true); return; }
  const unfinished = exam.isFullSet && results.length < exam.modules.length;
  const title = unfinished
    ? exam.title + "（完成 " + results.length + "/" + exam.modules.length + " 模块）"
    : exam.title;
  const aborted = exam.isFullSet
    && (exam.aborted || results.length < exam.modules.length);
  let record;
  if (results.length === 1) {
    const r = results[0];
    record = {
      id: Date.now(), date: new Date().toLocaleString("zh-CN"),
      title: title,
      score: (exam.mode === "full" ? r.score : (r.scoreDone != null ? r.scoreDone : r.score)),
      correct: r.correct, wrong: r.wrong, total: r.total, answered: r.answered,
      wrongAnswered: r.wrongAnswered || 0, unanswered: r.unanswered || 0,
      wrongIds: r.wrongIds || [], time: fmtTime(r.elapsed), finished: true,
      incomplete: aborted
    };
  } else {
    const total = results.reduce((s, r) => s + r.total, 0);
    const correct = results.reduce((s, r) => s + r.correct, 0);
    const answered = results.reduce((s, r) => s + (r.answered || 0), 0);
    const elapsed = results.reduce((s, r) => s + r.elapsed, 0);
    record = {
      id: Date.now(), date: new Date().toLocaleString("zh-CN"),
      title: title,
      score: Math.round(results.reduce((s, r) =>
        s + (exam.mode === "full" ? r.score : (r.scoreDone != null ? r.scoreDone : r.score)) * r.total, 0) / total),
      correct: correct, wrong: total - correct, total: total, answered: answered,
      wrongAnswered: results.reduce((s, r) => s + (r.wrongAnswered || 0), 0),
      unanswered: total - answered,
      wrongIds: results.flatMap(r => r.wrongIds || []),
      time: fmtTime(elapsed), finished: true, incomplete: aborted,
      breakdown: results.map(r => ({ name: r.name, score: r.score, total: r.total, correct: r.correct }))
    };
  }
  // 仅全真模拟计入考试纪录，专题/重练/收藏只出结果页
  if (exam.mode === "full") {
    state.history.unshift(record);
    if (state.history.length > 100) state.history = state.history.slice(0, 100);
  }
  saveAll();
  if (silent) { navigate("home", true); return; }   // 中途退出：直接回首页，成绩已存入考试记录
  renderResult(record, results);
  navigate("result", true);
}

let lastPosterData = null;
function renderResult(record, results) {
  lastPosterData = { record: record, results: results };
  let label = record.score >= 90 ? "优秀！考场状态拉满！"
    : record.score >= 80 ? "良好，再补补错题！"
    : record.score >= 60 ? "及格，针对性加强！"
    : "多刷专题和错题，加油！";
  const incomplete = !!record.incomplete;
  const headPart = incomplete
    ? `<div class="result-incomplete">本次考试未作答完毕</div>`
    : `<div class="result-score">${record.score}<span class="unit">分</span></div>
       <div class="result-label">${label}</div>`;
  let html = `<div class="result-head"><h2>${esc(record.title)}</h2>${headPart}</div>
    <div class="result-stats">
      <div class="result-stat"><div class="num">${record.answered}</div><div class="label">已做</div></div>
      <div class="result-stat"><div class="num">${record.correct}</div><div class="label">答对</div></div>
      <div class="result-stat"><div class="num">${record.wrongAnswered != null ? record.wrongAnswered : record.wrong}</div><div class="label">答错</div></div>
      <div class="result-stat"><div class="num">${record.time}</div><div class="label">总用时</div></div>
    </div>
    <p class="result-note">本次共 ${record.total} 题${record.total - record.answered > 0 ? "，未作答 " + (record.total - record.answered) + " 题" : ""}</p>`;
  if (!incomplete && exam && exam.mode !== "practice" && exam.systemKey === "yiqian") {
    html += `<div class="result-ref"><b>这次分数算什么水平？</b><br>` +
      `据作者和 2026 年 9 月参加过机考的同志交流：<b>90 分基本就是全区第一</b>，80 分已经算高的，七十几分属于正常水平。` +
      `分数只作参考，稳住心态、把错题吃透，比多考几分更管用。</div>`;
  }
  if (results.length > 1) {
    html += `<div class="module-breakdown"><div class="mb-title">各模块分项</div>`;
    results.forEach(r => {
      const color = r.score >= 80 ? "var(--success)" : r.score >= 60 ? "var(--warn)" : "var(--error)";
      html += `<div class="mb-row">
        <span class="mb-name">${esc(r.name)}</span>
        <div class="mb-bar"><div class="mb-fill" style="width:${r.score}%;background:${color};"></div></div>
        <span class="mb-score" style="color:${color};">${r.score}分</span></div>`;
    });
    html += `</div>`;
  }
  html += `<div class="result-actions">
    <button class="btn btn-primary" onclick="navigate('home',true)">返回首页</button>
    <button class="btn btn-secondary" onclick="showExamWrong()">查看本场错题</button>` +
    (record.incomplete ? '' : `<button class="btn btn-gold" onclick="posterExam()">生成战报图</button>`) + `</div>`;
  document.getElementById("result-card").innerHTML = html;
}

/* 本场错题：只列出这一场里答错 / 未答的题，不跳错题本 */
function collectExamWrong() {
  const out = [];
  if (!exam || !exam.modules) return out;
  exam.modules.forEach(m => {
    m.questions.forEach((q, idx) => {
      const a = m.answers[idx];
      // 只算「答了且答错」的题；没作答的不算本场错题
      if (a && a.answered && a.judged && !a.correct) out.push({ q, a, module: m.name, no: idx + 1 });
    });
  });
  return out;
}
function showExamWrong() {
  state.examWrong = collectExamWrong();
  navigate("review");
}
function renderReview() {
  const list = state.examWrong || [];
  const fromHist = state.reviewBack === "history";
  document.getElementById("review-title").textContent = "本场错题";
  document.getElementById("review-sub").textContent = fromHist
    ? (state.reviewTitle || "考试记录") + " · " + list.length + " 题"
    : (exam ? exam.title + " · " : "") + list.length + " 题（只含本场答错的题，没答的不算）";
  const le = document.getElementById("review-list");
  if (!list.length) {
    le.innerHTML = `<div class="empty-state"><div class="icon">✅</div><p>本场没有错题，漂亮！</p></div>`;
    return;
  }
  le.innerHTML = list.map((it, idx) => {
    const a = it.a;
    const your = userAnswerText(a.choice || {}, it.q.type);
    const stem = it.q.type === "fill" ? String(it.q.question).replace("□", "（　）") : it.q.question;
    return `<div class="list-item" style="cursor:pointer;" onclick="openQById('${it.q.id}')">
      <div class="item-index">${idx + 1}</div>
      <div class="item-content">
        <div class="item-title">${esc(stem)}</div>
        <div class="item-meta">
          <span>${esc(it.module)}${it.no ? " · 第" + it.no + "题" : ""}</span>
          ${your ? "<span>你的答案:" + esc(your) + "</span>" : ""}
          <span class="miss">正确:${esc(answerText(it.q))}</span>
          <span style="color:var(--army-green);">点开看解析 ›</span>
        </div>
        <div class="review-exp">${esc(it.q.explanation || "")}</div>
      </div></div>`;
  }).join("");
}

/* ============ 退出确认 ============ */
function confirmExit() {
  // 先释放焦点：否则焦点会一直停在“退出”按钮上，之后按回车等于又点了一次退出
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (!exam || exam.finalized) { stopTimers(); navigate("home", true); return; }
  // 背题模式：不判分，确认后直接走
  if (exam.mode === "memorize") {
    if (confirm("退出背题模式？")) { stopTimers(); navigate("home", true); }
    return;
  }
  // 模块过渡页：只结算已经完成的模块，不能把刚交的模块再记一次
  if (state.view === "transition") {
    if (confirm("结束整套连考并结算？已完成 " + exam.moduleResults.length + " 个模块。")) {
      finalizeExam();
    }
    return;
  }
  const m = cm();
  const answered = m.answers.filter(a => a && a.answered).length;
  if (answered === 0) {
    if (confirm("还没有作答，确定退出吗？")) { stopTimers(); navigate("home", true); }
    return;
  }
  const tip = exam.mode === "full"
    ? "已答部分将计分保存，没答的只算未答、不进错题本。"
    : "退出后会显示本次练习的结果：做了多少题、对几道、错几道，错题也能点开看解析。";
  if (confirm("确定退出吗？已答" + answered + "题。" + tip)) {
    // 已答的按实际选择判分，没答的记为未答，然后结算出结果页
    judgePendingInModule(m, false);
    if (!m.finished) {
      m.finished = true;
      exam.moduleResults.push(calcModuleResult(m));
    }
    exam.aborted = true;     // 中途退出：本次考试未作答完毕
    finalizeExam();
  }
}

/* ============ 错题本 ============ */
function answerText(q) {
  if (q.type === "single") return q.answer;
  if (q.type === "fill") return q.answer;
  if (q.type === "rating") {
    const s = q.answer.scores;
    return Object.keys(s).map(k => k + " " + RATE_LABELS[s[k] - 1]).join("、");
  }
  return "最符合" + q.answer.most + " 最不符合" + q.answer.least;
}
function userAnswerText(choice, type) {
  if (type === "single") return choice || "-";
  if (type === "fill") return choice || "-";
  if (type === "rating") {
    if (!choice) return "-";
    return Object.keys(choice).map(k => k + " " + RATE_LABELS[choice[k] - 1]).join("、");
  }
  return "最符合" + ((choice && choice.most) || "-") + " 最不符合" + ((choice && choice.least) || "-");
}
function addWrong(q, choice, timedOut) {
  const entry = { answer: JSON.parse(JSON.stringify(choice || {})), time: Date.now(), timedOut: !!timedOut };
  const existing = state.wrong.find(w => w.id === q.id);
  if (existing) {
    existing.wrongCount = (existing.wrongCount || 1) + 1;
    existing.userAnswer = choice;
    existing.wrongTime = Date.now();
    existing.timedOut = timedOut;
    existing.wrongHistory = (existing.wrongHistory || []).concat(entry);
  } else {
    state.wrong.push(Object.assign(JSON.parse(JSON.stringify(q)), {
      userAnswer: choice, wrongTime: Date.now(),
      wrongCount: 1, timedOut: timedOut, correctCount: 0,
      wrongHistory: [entry]
    }));
  }
  save(K.wrong, state.wrong);
}

function wrongBucketOf(q) {
  const c = q.correctCount || 0;
  return c >= 4 ? "4+" : String(c);
}
function renderWrong() {
  const sys = state.wrongSys || "yiqian";
  const bySys = state.wrong.filter(q => sysOfId(q.id) === sys);
  document.getElementById("wrong-sys").innerHTML = ["yiqian", "tijian"].map(k => {
    const n = state.wrong.filter(q => sysOfId(q.id) === k).length;
    return `<button class="sys-tab ${sys === k ? "active" : ""}"
      onclick="state.wrongSys='${k}';state.wrongFilter='all';state.wrongCorrect='all';renderWrong()">${SYS_LABELS[k]}（${n}题）</button>`;
  }).join("");
  const groups = SYS_GROUPS[sys];
  const filters = [{ key: "all", name: "全部", n: bySys.length }].concat(
    groups.map(g => ({ key: g, name: g, n: bySys.filter(q => q.group === g).length })));
  document.getElementById("wrong-filter").innerHTML = filters.map(f =>
    `<button class="filter-btn ${state.wrongFilter === f.key ? "active" : ""}"
      onclick="state.wrongFilter='${f.key}';renderWrong()">${f.name}<span class="filter-n">${f.n}</span></button>`).join("");
  // 按「做对次数」筛选
  const byGroup = state.wrongFilter === "all" ? bySys : bySys.filter(q => q.group === state.wrongFilter);
  const buckets = [
    { key: "all", name: "全部" }, { key: "0", name: "做对0次" }, { key: "1", name: "做对1次" },
    { key: "2", name: "做对2次" }, { key: "3", name: "做对3次" }, { key: "4+", name: "3次以上" }
  ];
  document.getElementById("wrong-correct-filter").innerHTML = buckets.map(b =>
    `<button class="filter-btn ${state.wrongCorrect === b.key ? "active" : ""}"
      onclick="state.wrongCorrect='${b.key}';renderWrong()">${b.name}<span class="filter-n">${
        b.key === "all" ? byGroup.length : byGroup.filter(q => wrongBucketOf(q) === b.key).length
      }</span></button>`).join("");
  let qs = byGroup;
  if (state.wrongCorrect !== "all") qs = qs.filter(q => wrongBucketOf(q) === state.wrongCorrect);
  const le = document.getElementById("wrong-list");
  if (qs.length === 0) {
    le.innerHTML = `<div class="empty-state"><div class="icon">🎉</div><p>${SYS_LABELS[sys]}暂无错题，继续保持！</p></div>`;
    return;
  }
  le.innerHTML = qs.map((q, idx) => {
    const missCls = q.wrongCount > 1 ? "miss" : "";
    const cc = q.correctCount || 0;
    const wh = (q.wrongHistory && q.wrongHistory.length) ? q.wrongHistory : [{ answer: q.userAnswer, time: q.wrongTime }];
    const hist = wh.slice(-4);
    const histTxt = (wh.length > 4 ? "… → " : "") +
      hist.map(h => userAnswerText(h.answer, q.type)).join(" → ");
    return `<div class="list-item" onclick="showDetail('${q.id}','wrong')">
      <div class="item-index">${idx + 1}</div>
      <div class="item-content">
        <div class="item-title">${esc(q.question)}</div>
        <div class="item-meta">
          <span>${esc(q.group)}</span>
          <span>最近答错:${esc(userAnswerText(q.userAnswer, q.type))}</span>
          <span>正确:${esc(answerText(q))}</span>
          <span>${cc > 0 ? '<b class="ok-count">做对' + cc + '次</b>' : '做对0次'} · <span class="${missCls}">错过${q.wrongCount || 1}次</span></span>
        </div>
        <div class="item-sub">历史错答：${esc(histTxt)}</div>
      </div>
      <div class="item-action">
        <button class="mini-btn danger" onclick="event.stopPropagation();removeWrong('${q.id}')">移除</button>
      </div></div>`;
  }).join("");
}

/* ============ 一键移出错题本（按做对次数） ============ */
function openBulkRemove() {
  const sysLabel = SYS_LABELS[state.wrongSys || "yiqian"];
  const groupLabel = state.wrongFilter === "all" ? "全部板块" : state.wrongFilter;
  document.getElementById("modal-content").innerHTML = `
    <div class="bulk-title">按「做对次数」移出错题</div>
    <div class="bulk-sub">范围：${sysLabel} · ${groupLabel}（当前页签与筛选）</div>
    <label class="bulk-row"><input type="checkbox" id="bulk-c1"> 做对 <b>1</b> 次的错题</label>
    <label class="bulk-row"><input type="checkbox" id="bulk-c2"> 做对 <b>2</b> 次的错题</label>
    <label class="bulk-row"><input type="checkbox" id="bulk-c3"> 做对 <b>3</b> 次的错题</label>
    <label class="bulk-row"><input type="checkbox" id="bulk-c4"> 做对 <b>3 次以上</b>的错题</label>
    <div class="bulk-actions">
      <button class="btn btn-secondary" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="confirmBulkRemove()">移出所选</button>
    </div>`;
  document.getElementById("modal").classList.add("show");
}
function confirmBulkRemove() {
  const picks = ["1", "2", "3", "4+"].filter(k => document.getElementById("bulk-c" + k.replace("+", "")).checked);
  if (!picks.length) { alert("请先勾选要做对几次的错题"); return; }
  const sys = state.wrongSys || "yiqian";
  let removed = 0;
  state.wrong = state.wrong.filter(q => {
    if (sysOfId(q.id) !== sys) return true;
    if (state.wrongFilter !== "all" && q.group !== state.wrongFilter) return true;
    if (!picks.includes(wrongBucketOf(q))) return true;
    removed++;
    return false;
  });
  save(K.wrong, state.wrong);
  closeModal();
  renderWrong();
  alert("已移出 " + removed + " 道错题");
}
function removeWrong(id) {
  state.wrong = state.wrong.filter(q => q.id !== id);
  saveAll(); renderWrong();
}
function clearWrong() {
  if (confirm("确定清空所有错题？")) { state.wrong = []; saveAll(); renderWrong(); }
}
/* ============ 收藏 ============ */
function toggleMark(kind, id) {
  const arrKey = kind === "fav" ? "favorites" : kind;
  const arr = state[arrKey];
  const pos = arr.indexOf(id);
  if (pos >= 0) arr.splice(pos, 1); else arr.push(id);
  saveAll();
  renderQuestion();
}
function renderFavorites() {
  const sys = state.favSys || "yiqian";
  const favQs = QUESTIONS.filter(q => state.favorites.includes(q.id));
  const bySys = favQs.filter(q => sysOfId(q.id) === sys);
  document.getElementById("fav-sys").innerHTML = ["yiqian", "tijian"].map(k => {
    const n = favQs.filter(q => sysOfId(q.id) === k).length;
    return `<button class="sys-tab ${sys === k ? "active" : ""}"
      onclick="state.favSys='${k}';state.favFilter='all';renderFavorites()">${SYS_LABELS[k]}（${n}题）</button>`;
  }).join("");
  const groups = SYS_GROUPS[sys];
  const filters = [{ key: "all", name: "全部", n: bySys.length }].concat(
    groups.map(g => ({ key: g, name: g, n: bySys.filter(q => q.group === g).length })));
  document.getElementById("fav-filter").innerHTML = filters.map(f =>
    `<button class="filter-btn ${state.favFilter === f.key ? "active" : ""}"
      onclick="state.favFilter='${f.key}';renderFavorites()">${f.name}<span class="filter-n">${f.n}</span></button>`).join("");
  let qs = bySys;
  if (state.favFilter !== "all") qs = qs.filter(q => q.group === state.favFilter);
  const le = document.getElementById("fav-list");
  if (qs.length === 0) {
    le.innerHTML = `<div class="empty-state"><div class="icon">⭐</div><p>${SYS_LABELS[sys]}暂无收藏题目</p></div>`;
    return;
  }
  le.innerHTML = qs.map((q, idx) =>
    `<div class="list-item" onclick="showDetail('${q.id}')">
      <div class="item-index">${idx + 1}</div>
      <div class="item-content">
        <div class="item-title">${esc(q.question)}</div>
        <div class="item-meta"><span>${esc(q.group)}</span><span>答案:${esc(answerText(q))}</span></div></div>
      <div class="item-action">
        <button class="mini-btn danger" onclick="event.stopPropagation();unfav('${q.id}')">取消收藏</button>
      </div></div>`).join("");
}
function unfav(id) {
  state.favorites = state.favorites.filter(x => x !== id);
  saveAll(); renderFavorites();
}
function clearFavorites() {
  if (confirm("确定清空收藏？")) { state.favorites = []; saveAll(); renderFavorites(); }
}

/* ============ 考试纪录 ============ */
function renderHistory() {
  const le = document.getElementById("history-list");
  if (state.history.length === 0) {
    le.innerHTML = `<div class="empty-state"><div class="icon">📋</div><p>暂无考试纪录</p></div>`;
    return;
  }
  le.innerHTML = state.history.map((r, idx) =>
    `<div class="list-item" style="cursor:pointer;" onclick="openRecordWrong('${r.id}')">
      <div class="item-index">${idx + 1}</div>
      <div class="item-content">
        <div class="item-title">${esc(r.title)}</div>
        <div class="item-meta">
          <span>${esc(r.date)}</span>
          <span>已答${(r.answered != null ? r.answered : r.correct + r.wrong)}/${r.total}</span>
          <span>答对${r.correct}</span>
          <span>用时${r.time}</span>
          <span style="color:var(--army-green);">点开看本场错题 ›</span>
        </div></div>
      <div class="item-score">${r.incomplete ? "未完成" : r.score + "分"}</div></div>`).join("");
}
function clearHistory() {
  if (confirm("确定清空考试纪录？")) { state.history = []; saveAll(); renderHistory(); }
}

/* ============ 题目详情弹窗 ============ */
function showDetail(id, src) {
  const q = src === "wrong"
    ? state.wrong.find(x => x.id === id)
    : QUESTIONS.find(x => x.id === id);
  if (!q) return;
  let opts = Object.entries(q.options).map(([letter, text]) => {
    let cls = "option-item disabled";
    if (q.type === "single") {
      if (letter === q.answer) cls += " correct";
    } else if (q.type === "rating") {
      cls += " correct";
    } else {
      if (letter === q.answer.most) cls += " correct";
      if (letter === q.answer.least) cls += " correct";
    }
    let badge = "";
    if (q.type === "forced") {
      if (letter === q.answer.most) badge = `<span class="role-badge most">最符合</span>`;
      if (letter === q.answer.least) badge = `<span class="role-badge least">最不符合</span>`;
    }
    if (q.type === "rating") {
      badge = `<span class="role-badge most">参考 ${q.answer.scores[letter]} 分</span>`;
    }
    return `<div class="${cls}" style="cursor:default;">
      <div class="option-letter">${letter}</div>
      <div class="option-text">${esc(text)}${badge}</div></div>`;
  }).join("");
  let wrongInfo = "";
  if (src === "wrong") {
    const hist = (q.wrongHistory && q.wrongHistory.length) ? q.wrongHistory : [{ answer: q.userAnswer, time: q.wrongTime }];
    const fmtT = t => {
      const d = new Date(t || Date.now());
      return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    };
    wrongInfo = `<div class="wrong-summary">做对 <b>${q.correctCount || 0}</b> 次 · 答错 <b>${q.wrongCount || 1}</b> 次</div>
      <ul class="wrong-history-list">${hist.map((h, idx) =>
        `<li><span>第${idx + 1}次</span><span>你答：<b>${esc(userAnswerText(h.answer, q.type))}</b></span><span class="hist-time">${fmtT(h.time)}</span></li>`).join("")}</ul>`;
  }
  document.getElementById("modal-content").innerHTML =
    `<div class="question-meta">
      <span class="question-num">${esc(q.group)}</span>
      <span class="question-category">${esc(q.category || "")}</span>
      <span class="question-source">${esc(q.sourceName || "")}</span></div>
    ${wrongInfo}
    <div class="question-text" style="font-size:15px;">${esc(q.type === "fill" ? String(q.question).replace("□", "（　）") : q.question)}</div>
    <div class="options-list" style="margin-bottom:14px;">${opts}</div>
    <div class="explanation-box show">
      <div class="explanation-title">答案解析</div>
      <div class="explanation-text">正确答案：<span class="correct-answer">${esc(answerText(q))}</span><br>${esc(q.explanation)}</div></div>`;
  document.getElementById("modal").classList.add("show");
}
function closeModal() { document.getElementById("modal").classList.remove("show"); }

/* ============ 记录 / 错题详情 ============ */
function goBackFromReview() { navigate(state.reviewBack === "history" ? "history" : "result", true); }

function openRecordWrong(recId) {
  const rec = state.history.find(r => String(r.id) === String(recId));
  if (!rec) return;
  const ids = rec.wrongIds || [];
  if (!ids.length) { alert("这场考试没有错题（或该场次较早，没有保存错题明细）"); return; }
  state.examWrong = ids.map(id => {
    const q = QUESTIONS.find(x => x.id === id) || state.wrong.find(x => x.id === id);
    return q ? { q, a: { choice: {}, judged: true }, module: rec.title, no: 0 } : null;
  }).filter(Boolean);
  if (!state.examWrong.length) { alert("这场的错题在当前题库里找不到了"); return; }
  state.reviewBack = "history";
  state.reviewTitle = rec.title;
  navigate("review");
}

function openQById(id) {
  const q = QUESTIONS.find(x => x.id === id)
    || (state.examWrong || []).map(it => it.q).find(x => x.id === id)
    || state.wrong.find(x => x.id === id);
  if (!q) return;
  const opts = Object.entries(q.options || {}).map(([letter, text]) => {
    let cls = "option-item disabled";
    let badge = "";
    if (q.type === "single" && letter === q.answer) cls += " correct";
    if (q.type === "forced") {
      if (letter === q.answer.most) { cls += " correct"; badge = '<span class="role-badge most">最符合</span>'; }
      if (letter === q.answer.least) { cls += " correct"; badge = '<span class="role-badge least">最不符合</span>'; }
    }
    if (q.type === "rating") {
      cls += " correct";
      badge = '<span class="role-badge most">参考 ' + q.answer.scores[letter] + ' 分</span>';
    }
    return '<div class="' + cls + '" style="cursor:default;">' +
      '<div class="option-letter">' + letter + '</div>' +
      '<div class="option-text">' + esc(text) + badge + '</div></div>';
  }).join("");
  document.getElementById("modal-content").innerHTML =
    '<div class="question-meta"><span class="question-num">' + esc(q.group) + '</span>' +
    '<span class="question-category">' + esc(q.category || "") + '</span></div>' +
    '<div class="question-text" style="font-size:15px;">' +
    esc(q.type === "fill" ? String(q.question).replace("□", "（　）") : q.question) + '</div>' +
    '<div class="options-list" style="margin-bottom:14px;">' + opts + '</div>' +
    '<div class="explanation-box show"><div class="explanation-title">答案解析</div>' +
    '<div class="explanation-text">正确答案：<span class="correct-answer">' +
    esc(answerText(q)) + '</span><br>' + esc(q.explanation || "") + '</div></div>';
  document.getElementById("modal").classList.add("show");
}

/* ============ 统计 ============ */
function recordStat(q, correct) {
  const bucket = (exam && exam.mode === "full" && exam.systemKey) ? exam.systemKey : "practice";
  const key = bucket + "|" + statCatOf(q.group);
  if (!state.cstat[key]) state.cstat[key] = { total: 0, correct: 0 };
  state.cstat[key].total++;
  if (correct) state.cstat[key].correct++;
  const d = todayStr();
  if (!state.daily[d]) state.daily[d] = { count: 0, correct: 0 };
  state.daily[d].count++;
  if (correct) state.daily[d].correct++;
  // 错题本不再做对一次就移出：累计做对次数，之后可手动筛选、一键移出
  if (correct) {
    const w = state.wrong.find(w => w.id === q.id);
    if (w) {
      w.correctCount = (w.correctCount || 0) + 1;
      w.lastCorrectTime = Date.now();
    }
  }
  save(K.cstat, state.cstat); save(K.daily, state.daily); save(K.wrong, state.wrong);
}

function statRow(bucket, c, label) {
  const s = state.cstat[bucket + "|" + c.key];
  const has = s && s.total;
  const pct = has ? Math.round(s.correct / s.total * 100) : 0;
  const color = pct >= 80 ? "var(--success)" : pct >= 60 ? "var(--warn)" : "var(--error)";
  return `<div class="bar-chart-row">
    <span class="bl">${label || c.name}</span>
    <div class="bb"><div class="bf" style="width:${has ? pct : 0}%;background:${color};"></div></div>
    <span class="bv" style="width:auto;min-width:74px;font-size:11.5px;">${has ? pct + "% · " + s.total + "题" : "—"}</span></div>`;
}

function renderStats() {
  const vals = Object.values(state.cstat);
  const totalAnswered = vals.reduce((s, x) => s + x.total, 0);
  const totalCorrect = vals.reduce((s, x) => s + x.correct, 0);
  const boxes = [
    { n: totalAnswered, l: "累计做题" },
    { n: totalCorrect, l: "累计答对" },
    { n: totalAnswered ? Math.round(totalCorrect / totalAnswered * 100) + "%" : "0%", l: "总正确率" },
    { n: state.wrong.length, l: "当前错题" },
    { n: state.history.length, l: "完成考试" }
  ];
  document.getElementById("stat-boxes").innerHTML = boxes.map(b =>
    `<div class="stat-box"><div class="n">${b.n}</div><div class="l">${b.l}</div></div>`).join("");

  // 按两场考试分开统计，每场三个板块
  const sysDefs = [
    {
      key: "yiqian", name: "役前机考",
      sub: "心理250题 · 综合计算100题 · 综合言语常识100题",
      labels: { speech: "综合言语常识", shu: "综合计算" }
    },
    {
      key: "tijian", name: "体检机考",
      sub: "言语100题 · 数学计算100题 · 心理人格300题",
      labels: { shu: "数学计算" }
    }
  ];
  let html = sysDefs.map(sys =>
    `<div class="sys-stats"><div class="sys-title">${sys.name}<span>${sys.sub}</span></div>` +
    STAT_CATS.map(c => statRow(sys.key, c, sys.labels && sys.labels[c.key])).join("") + `</div>`).join("");

  // 专项练习（错题重练/收藏/专题）单独一块，没有数据就不显示
  const hasPractice = Object.keys(state.cstat).some(k => k.startsWith("practice|") && state.cstat[k].total);
  if (hasPractice) {
    html += `<div class="sys-stats"><div class="sys-title">专项练习<span>错题重练 / 收藏复习 / 专题练习</span></div>` +
      STAT_CATS.map(c => statRow("practice", c)).join("") + `</div>`;
  }
  document.getElementById("group-chart").innerHTML = html;

  // 每日做题量：只显示真正做过题的日期，没做的日期不显示
  const days = Object.keys(state.daily)
    .filter(k => state.daily[k] && state.daily[k].count > 0)
    .sort().reverse()
    .map(k => ({ key: k, v: state.daily[k].count, c: state.daily[k].correct || 0 }));
  if (!days.length) {
    document.getElementById("daily-chart").innerHTML =
      `<div class="empty-state" style="padding:10px 0;"><p>还没有做题记录，做几道题这里就会按日期显示。</p></div>`;
  } else {
    const maxV = Math.max(1, ...days.map(d => d.v));
    document.getElementById("daily-chart").innerHTML = days.map(d =>
      `<div class="bar-chart-row">
        <span class="bl">${d.key}</span>
        <div class="bb"><div class="bf" style="width:${d.v / maxV * 100}%;"></div></div>
        <span class="bv">${d.v}题</span></div>`).join("");
  }
}

/* ============ 设置 ============ */
function renderSettings() {
  document.getElementById("set-instant").checked = settings.instant;
  document.getElementById("set-autonext").checked = settings.autoNext;
}
function renderAbout() {
  // 关于页为静态内容
}

/* ============ 五维四型分数计算器 ============ */
/* 依据《五维四型评分标准》.docx：文化程度、体质状况、体能水平为可计算项；
   心理素质、军事职业适应能力由专门系统生成，本工具允许手填。仅供参考。 */
let calcSex = "m";
const CALC_EDU = [["大学本科及以上", 100], ["大学专科", 90], ["高中", 80], ["初中", 70]];
const CALC_DEGREE = [["博士", 100], ["硕士", 80], ["学士", 60], ["未取得学位", 0]];
const CALC_STUDY = [["毕业生", 100], ["在校生", 70]];
const CALC_TYPE = [["全日制", 100], ["非全日制", 80]];
const CALC_VITAL = [
  // [男≤18岁, 男19-20岁, 男21-22岁, 男≥23岁, 女≤18岁, 女19-20岁, 女21-22岁, 女≥23岁, 得分]
  [4940, 5040, 5140, 5240, 3350, 3400, 3450, 3550, 100],
  [4820, 4920, 5020, 5120, 3300, 3350, 3400, 3500, 95],
  [4700, 4800, 4900, 5000, 3250, 3300, 3350, 3450, 90],
  [4450, 4550, 4650, 4750, 3100, 3150, 3200, 3300, 85],
  [4200, 4300, 4400, 4500, 2950, 3000, 3050, 3150, 80],
  [4080, 4180, 4280, 4380, 2850, 2900, 2950, 3050, 78],
  [3960, 4060, 4160, 4260, 2750, 2800, 2850, 2950, 76],
  [3840, 3940, 4040, 4140, 2650, 2700, 2750, 2850, 74],
  [3720, 3820, 3920, 4020, 2550, 2600, 2650, 2750, 72],
  [3600, 3700, 3800, 3900, 2450, 2500, 2550, 2650, 70],
  [3480, 3580, 3680, 3780, 2350, 2400, 2450, 2550, 68],
  [3360, 3460, 3560, 3660, 2250, 2300, 2350, 2450, 66],
  [3240, 3340, 3440, 3540, 2150, 2200, 2250, 2350, 64],
  [3120, 3220, 3320, 3420, 2050, 2100, 2150, 2250, 62],
  [3000, 3100, 3200, 3300, 1950, 2000, 2050, 2150, 60],
  [2850, 2940, 3030, 3130, 1910, 1960, 2010, 2110, 50],
  [2700, 2780, 2860, 2960, 1870, 1920, 1970, 2070, 40],
  [2550, 2620, 2690, 2790, 1830, 1880, 1930, 2030, 30],
  [2400, 2460, 2520, 2620, 1790, 1840, 1890, 1990, 20],
  [2250, 2300, 2350, 2450, 1750, 1800, 1850, 1950, 10]
];
const CALC_JUMP = [[270, 206, 100], [265, 200, 95], [260, 194, 90], [253, 187, 85], [245, 180, 80],
  [241, 177, 78], [237, 174, 76], [233, 171, 74], [229, 168, 72], [225, 165, 70],
  [221, 162, 68], [217, 159, 66], [213, 156, 64], [209, 153, 62], [205, 150, 60],
  [200, 145, 50], [195, 140, 40], [190, 135, 30], [185, 130, 20], [180, 125, 10]];
const CALC_ROPE = [[198, 190, 100], [193, 184, 98], [186, 175, 96], [178, 166, 94], [168, 154, 92],
  [158, 142, 90], [152, 137, 87], [144, 130, 84], [136, 122, 81], [124, 112, 78],
  [113, 102, 75], [108, 98, 72], [101, 92, 69], [94, 86, 66], [85, 78, 63],
  [75, 70, 60], [71, 66, 50], [64, 59, 40], [58, 53, 30], [49, 44, 20], [40, 35, 10]];
const CALC_SIT = [[24.6, 25.3, 100], [22.8, 23.6, 95], [21.0, 21.9, 90], [19.1, 20.2, 85], [17.2, 18.5, 80],
  [15.8, 17.2, 78], [14.4, 15.9, 76], [13.0, 14.6, 74], [11.6, 13.3, 72], [10.2, 12.0, 70],
  [8.8, 10.7, 68], [7.4, 9.4, 66], [6.0, 8.1, 64], [4.6, 6.8, 62], [3.2, 5.5, 60],
  [2.2, 4.7, 50], [1.2, 3.9, 40], [0.2, 3.1, 30], [-0.8, 2.3, 20], [-1.8, 1.5, 10]];
const CALC_RUN1000 = [[200, 100], [205, 95], [210, 90], [217, 85], [225, 80], [230, 78], [235, 76],
  [240, 74], [245, 72], [250, 70], [255, 68], [260, 66], [265, 64], [270, 62], [275, 60],
  [295, 50], [315, 40], [335, 30], [355, 20], [375, 10]];
const CALC_RUN800 = [[200, 100], [206, 95], [212, 90], [219, 85], [226, 80], [231, 78], [236, 76],
  [241, 74], [246, 72], [251, 70], [256, 68], [261, 66], [266, 64], [271, 62], [276, 60],
  [286, 50], [296, 40], [306, 30], [316, 20], [326, 10]];
const CALC_THROW = [[15.7, 100], [14, 95], [11.5, 90], [11, 85], [10.4, 80], [10, 78], [9.8, 76],
  [9.5, 74], [9.3, 72], [9, 70], [8.8, 68], [8.5, 66], [8.2, 64], [7.9, 62], [7.5, 60],
  [7.3, 50], [7, 40], [6.7, 30], [6.2, 20], [5.8, 10]];
const CALC_SITUP = [[55, 100], [53, 95], [51, 90], [48, 85], [45, 80], [43, 78], [41, 76], [39, 74],
  [37, 72], [35, 70], [33, 68], [31, 66], [29, 64], [27, 62], [25, 60], [23, 50], [21, 40],
  [19, 30], [17, 20], [15, 10]];

function calcLookupHigh(v, rows, sexIdx) {
  for (const r of rows) if (v >= r[sexIdx]) return r[2];
  return 0;
}
/* 肺活量：按 性别×年龄段 取对应列 */
function calcVitalScore(v, sex) {
  const ageIdx = parseInt((document.getElementById("c-age") || {}).value || "0", 10) || 0;
  const col = (sex === "m" ? 0 : 4) + Math.max(0, Math.min(3, ageIdx));
  for (const r of CALC_VITAL) if (v >= r[col]) return r[8];
  return 0;
}
/* 单性别项目：每行 [门槛值, 得分] */
function calcLookupSingle(v, rows) {
  for (const r of rows) if (v >= r[0]) return r[1];
  return 0;
}
function calcLookupTime(sec, rows) {
  for (const r of rows) if (sec <= r[0]) return r[1];
  return 0;
}
function calcBalanceScore(sec, sex) {
  const m = [[86, 1e9, 100], [63, 86, 95], [51, 63, 90], [38, 51, 85], [30, 38, 80], [24, 30, 75],
    [19, 24, 70], [16, 19, 65], [12, 16, 60], [9, 12, 55], [5, 9, 50], [4, 5, 30], [0, 4, 10]];
  const f = [[90, 1e9, 100], [68, 90, 95], [56, 68, 90], [41, 56, 85], [33, 41, 80], [26, 33, 75],
    [21, 26, 70], [17, 21, 65], [13, 17, 60], [10, 13, 55], [6, 10, 50], [5, 6, 30], [0, 5, 10]];
  for (const [lo, hi, sc] of (sex === "m" ? m : f)) if (sec >= lo && sec < hi) return sc;
  return 0;
}
function calcBmiScore(bmi, sex) {
  if (sex === "m") {
    if (bmi >= 17.3 && bmi <= 23.8) return 100;
    if (bmi <= 17.2) return 80;
    if (bmi >= 23.9 && bmi <= 27.3) return 80;
    return 60;
  }
  if (bmi >= 17.1 && bmi <= 23.3) return 100;
  if (bmi <= 17.0) return 80;
  if (bmi >= 23.4 && bmi <= 25.7) return 80;
  return 60;
}
function setCalcSex(sex) {
  calcSex = sex;
  document.getElementById("c-sex-m").classList.toggle("on", sex === "m");
  document.getElementById("c-sex-f").classList.toggle("on", sex === "f");
  document.getElementById("c-run-label").textContent = sex === "m" ? "1000 米跑（分:秒）" : "800 米跑（分:秒）";
  document.getElementById("c-last-label").textContent = sex === "m" ? "投掷（2kg 实心球，米）" : "1 分钟仰卧起坐（个）";
  calcBmi();
  resetCalcResult();
}
function calcBmi() {
  const h = parseFloat(document.getElementById("c-height").value);
  const w = parseFloat(document.getElementById("c-weight").value);
  const box = document.getElementById("c-bmi");
  if (!h || !w || h < 100 || h > 250) { box.textContent = "BMI：—（填身高、体重后自动计算）"; return; }
  const bmi = w / ((h / 100) * (h / 100));
  const sc = calcBmiScore(bmi, calcSex);
  const label = sc === 100 ? "正常" : sc === 60 ? "肥胖" : (bmi < (calcSex === "m" ? 17.3 : 17.1) ? "低体重" : "超重");
  box.textContent = "BMI：" + bmi.toFixed(1) + "（" + label + "）";
}
function resetCalcResult() {
  const box = document.getElementById("calc-result");
  if (box) box.innerHTML = "";
  syncDegree();
}
/* 专科、高中、初中都没有学位：自动选「未取得学位」并锁住；本科及以上再放开 */
function syncDegree() {
  const edu = document.getElementById("c-edu");
  const deg = document.getElementById("c-degree");
  if (!edu || !deg) return;
  const noDegree = ["大学专科", "高中", "初中"].indexOf(edu.value) >= 0;
  if (noDegree) {
    deg.value = "未取得学位";
    deg.disabled = true;
    deg.title = "专科及以下学历没有学位";
  } else {
    deg.disabled = false;
    deg.title = "";
  }
}
/* 计算器输入校验：越界就提示是哪一项、应该填什么范围 */
function calcFail(id, msg) {
  const el = document.getElementById(id);
  alert(msg);
  if (el) { el.focus(); el.select && el.select(); el.scrollIntoView({ block: "center", behavior: "smooth" }); }
  return false;
}
function validateCalc() {
  const v = id => {
    const raw = (document.getElementById(id).value || "").trim();
    return raw === "" ? NaN : parseFloat(raw);
  };
  const isNum = x => !isNaN(x) && isFinite(x);
  const isInt = x => isNum(x) && Math.abs(x - Math.round(x)) < 1e-9;
  const check = (id, label, min, max, unit, intOnly) => {
    const x = v(id);
    if (!isNum(x)) {
      return calcFail(id, "「" + label + "」还没填，请填上（" + min + "~" + max + unit + "）。");
    }
    if (intOnly && !isInt(x)) {
      return calcFail(id, "「" + label + "」只能填整数，你填的是 " + x + "，请重新填一下。");
    }
    if (x < min || x > max) {
      return calcFail(id, "「" + label + "」只能填 " + min + "~" + max + unit + "，你填的是 " + x + unit + "。请按实际成绩重新填一下。");
    }
    return true;
  };

  if (!check("c-height", "身高", 130, 230, " cm")) return false;
  if (!check("c-weight", "体重", 30, 200, " kg")) return false;
  if (!check("c-vital", "肺活量", 800, 9000, " ml")) return false;
  if (!check("c-balance", "闭眼单脚站立", 1, 300, " 秒")) return false;
  if (!check("c-jump", "立定跳远", 80, 400, " cm")) return false;
  if (!check("c-rope", "1 分钟跳绳", 1, 500, " 个", true)) return false;
  if (!check("c-sit", "坐位体前屈", -30, 60, " cm")) return false;
  if (!check("c-run-m", "长跑（分钟）", 2, 15, " 分", true)) return false;
  if (!check("c-run-s", "长跑（秒）", 0, 59, " 秒", true)) return false;

  const lastLabel = calcSex === "m" ? "2kg 实心球投掷" : "1 分钟仰卧起坐";
  if (calcSex === "m") {
    if (!check("c-last", lastLabel, 1, 30, " 米")) return false;
  } else {
    if (!check("c-last", lastLabel, 0, 120, " 个", true)) return false;
  }

  if (!check("c-psych", "心理素质", 0, 100, " 分")) return false;
  if (!check("c-mil", "军事职业适应能力", 0, 100, " 分")) return false;
  return true;
}
function runCalc() {
  if (!validateCalc()) return;
  const num = id => parseFloat(document.getElementById(id).value);
  const box = document.getElementById("calc-result");
  const h = num("c-height"), w = num("c-weight"), vital = num("c-vital"), bal = num("c-balance");
  const jump = num("c-jump"), rope = num("c-rope"), sit = num("c-sit");
  const rm = num("c-run-m"), rs = num("c-run-s"), last = num("c-last");
  const eduName = document.getElementById("c-edu").value;
  const degName = document.getElementById("c-degree").value;
  const studyName = document.getElementById("c-study").value;
  const typeName = document.getElementById("c-type").value;
  const eduScore = CALC_EDU.find(x => x[0] === eduName)[1];
  const degScore = CALC_DEGREE.find(x => x[0] === degName)[1];
  const studyScore = CALC_STUDY.find(x => x[0] === studyName)[1];
  const typeScore = CALC_TYPE.find(x => x[0] === typeName)[1];
  const culture = eduScore * 0.25 + degScore * 0.21 + studyScore * 0.23 + typeScore * 0.31;

  const bmi = w / ((h / 100) * (h / 100));
  const bmiScore = calcBmiScore(bmi, calcSex);
  const vitalScore = calcVitalScore(vital, calcSex);
  const balScore = calcBalanceScore(bal, calcSex);
  const physique = bmiScore * 0.32 + vitalScore * 0.36 + balScore * 0.32;

  const jumpScore = calcLookupHigh(jump, CALC_JUMP, calcSex === "m" ? 0 : 1);
  const ropeScore = calcLookupHigh(rope, CALC_ROPE, calcSex === "m" ? 0 : 1);
  const sitScore = calcLookupHigh(sit, CALC_SIT, calcSex === "m" ? 0 : 1);
  const runSec = rm * 60 + rs;
  const runScore = calcLookupTime(runSec, calcSex === "m" ? CALC_RUN1000 : CALC_RUN800);
  const lastScore = calcSex === "m" ? calcLookupSingle(last, CALC_THROW) : calcLookupSingle(last, CALC_SITUP);
  const fitness = jumpScore * 0.20 + ropeScore * 0.20 + sitScore * 0.18 + runScore * 0.22 + lastScore * 0.20;

  const round1 = x => Math.round(x * 10) / 10;
  const psych = round1(num("c-psych")), mil = round1(num("c-mil"));
  const dims = [
    { name: "文化程度", score: culture, detail: "学历 " + eduScore + "×25% ＋ 学位 " + degScore + "×21% ＋ 学业 " + studyScore + "×23% ＋ 类型 " + typeScore + "×31%" },
    { name: "体质状况", score: physique, detail: "BMI " + bmi.toFixed(1) + "（" + bmiScore + " 分）×32% ＋ 肺活量（" + vitalScore + "）×36% ＋ 闭眼单脚站立（" + balScore + "）×32%" },
    { name: "体能水平", score: fitness, detail: "跳远 " + jumpScore + "×20% ＋ 跳绳 " + ropeScore + "×20% ＋ 体前屈 " + sitScore + "×18% ＋ 长跑 " + runScore + "×22% ＋ " + (calcSex === "m" ? "投掷" : "仰卧起坐") + " " + lastScore + "×20%" },
    { name: "心理素质", score: psych, detail: "手动填写（由心理测评系统生成）" },
    { name: "军事职业适应能力", score: mil, detail: "手动填写（由专门测评系统生成）" }
  ];
  const total = dims.reduce((s, d) => s + d.score, 0);

  box.innerHTML = `<div class="calc-result-title">测算结果</div>` +
    dims.map(d => `<div class="calc-dim"><div class="calc-dim-head"><span>${d.name}</span><b>${d.score.toFixed(1)}</b></div>
      <div class="calc-dim-detail">${d.detail}</div></div>`).join("") +
    `<div class="calc-total"><span>总分（满分 500）</span><b>${total.toFixed(1)}</b></div>
     <p class="calc-note">注：以上为按《五维四型评分标准》估算的参考分。各地具体评分标准可能不统一（分项权重、评分线、年龄段划分都可能有出入），本结果仅供参考，请以当地标准、当地征兵办公示为准。</p>
     <p class="calc-note">据作者与 2026 年 9 月成功定兵的同志们交流，总分<b>可能要 410 分左右才够用</b>；各地竞争激烈程度不同，这个数字仅供参考。具体可以进作者的抖音老乡群，找老乡交流当地信息。</p>` +
    `<button class="btn btn-primary calc-poster-btn" onclick="posterCalc()">一键导出分数单</button>`;
  window.__calcDims = dims; window.__calcTotal = total;
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}
/* 复制文本：优先 Clipboard API，file:// 下不可用时回退 execCommand */
function copyText(text, btn) {
  const flash = () => {
    if (btn) { const o = btn.textContent; btn.textContent = "已复制"; setTimeout(() => { btn.textContent = o; }, 1500); }
  };
  const fallback = () => {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.focus(); ta.select();
    try { document.execCommand("copy"); flash(); }
    catch (e) { alert("复制失败，请手动长按数字选择复制"); }
    document.body.removeChild(ta);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(flash).catch(fallback);
  } else { fallback(); }
}

/* ============ 分享海报（canvas 生成，长按/下载保存） ============ */
const POSTER_W = 1080, POSTER_H = 1440;
const P_GOLD = "#D7B26A", P_IVORY = "#F4F0E4";
const P_MUTED = "rgba(244,240,228,.62)", P_FAINT = "rgba(244,240,228,.38)";
const P_INK = "#0B1712";
const POSTER_FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';

function posterCtx() {
  const c = document.createElement("canvas");
  c.width = POSTER_W; c.height = POSTER_H;
  return { c, ctx: c.getContext("2d") };
}
function posterRound(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function posterText(ctx, txt, x, y, size, color, weight, align) {
  ctx.fillStyle = color || P_IVORY;
  ctx.font = (weight || 700) + " " + size + "px " + POSTER_FONT;
  ctx.textAlign = align || "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(txt, x, y);
}
function posterWrap(ctx, txt, x, y, maxW, lh, size, color) {
  ctx.font = "400 " + size + "px " + POSTER_FONT;
  ctx.fillStyle = color || P_MUTED;
  ctx.textAlign = "left";
  let line = "", cy = y;
  for (const ch of txt) {
    if (ctx.measureText(line + ch).width > maxW) { ctx.fillText(line, x, cy); line = ch; cy += lh; }
    else line += ch;
  }
  if (line) ctx.fillText(line, x, cy);
  return cy;
}
function posterHair(ctx, y, x1, x2, alpha) {
  ctx.save();
  ctx.strokeStyle = "rgba(244,240,228," + (alpha || 0.1) + ")";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
  ctx.restore();
}
function posterBase(ctx, kicker) {
  const g = ctx.createLinearGradient(0, 0, POSTER_W, POSTER_H);
  g.addColorStop(0, "#0E1D15"); g.addColorStop(0.55, "#0A1510"); g.addColorStop(1, "#07100C");
  ctx.fillStyle = g; ctx.fillRect(0, 0, POSTER_W, POSTER_H);

  let rg = ctx.createRadialGradient(950, 90, 0, 950, 90, 640);
  rg.addColorStop(0, "rgba(215,178,106,.16)"); rg.addColorStop(1, "rgba(215,178,106,0)");
  ctx.fillStyle = rg; ctx.fillRect(0, 0, POSTER_W, POSTER_H);

  rg = ctx.createRadialGradient(90, 1300, 0, 90, 1300, 560);
  rg.addColorStop(0, "rgba(74,124,98,.22)"); rg.addColorStop(1, "rgba(74,124,98,0)");
  ctx.fillStyle = rg; ctx.fillRect(0, 0, POSTER_W, POSTER_H);

  ctx.strokeStyle = "rgba(244,240,228,.12)"; ctx.lineWidth = 1.5;
  ctx.strokeRect(56, 56, POSTER_W - 112, POSTER_H - 112);

  ctx.fillStyle = P_GOLD; posterRound(ctx, 80, 88, 76, 76, 20); ctx.fill();
  posterText(ctx, "机考", 118, 141, 32, P_INK, 800, "center");

  posterText(ctx, "役前 / 体检机考训练系统", 182, 124, 33, P_IVORY, 700);
  posterText(ctx, "免费 · 免登录 · 随时练", 182, 162, 23, P_MUTED, 400);
  posterText(ctx, kicker, 1000, 128, 25, P_GOLD, 600, "right");

  posterHair(ctx, 212, 80, 1000, 0.12);
}
function posterFooterNote(ctx, note) {
  posterHair(ctx, 1240, 80, 1000, 0.12);
  posterText(ctx, "一粒麦子", 80, 1325, 31, P_GOLD, 700);
  //posterText(ctx, "搜「一粒麦子」→ 主页群 → 群收藏，领完整题库", 80, 1348, 26, P_MUTED, 400);
  posterText(ctx, note, 1000, 1348, 21, P_FAINT, 400, "right");
}
function posterBigScore(ctx, value, unit, baseY, size) {
  ctx.font = "900 " + size + "px " + POSTER_FONT;
  const wv = ctx.measureText(value).width;
  ctx.font = "600 42px " + POSTER_FONT;
  const wu = ctx.measureText(unit).width + 14;
  const x0 = (POSTER_W - (wv + wu)) / 2;
  posterText(ctx, value, x0, baseY, size, P_GOLD, 900);
  posterText(ctx, unit, x0 + wv + 14, baseY - 6, 42, P_MUTED, 600);
}
function posterStatRow(ctx, cells, y) {
  const n = cells.length, w = 920 / n, x0 = 80;
  cells.forEach((it, i) => {
    const cx = x0 + i * w + w / 2;
    posterText(ctx, String(it[1]), cx, y, 50, P_IVORY, 700, "center");
    posterText(ctx, it[0], cx, y + 40, 23, P_MUTED, 400, "center");
    if (i > 0) posterHair(ctx, y - 46, x0 + i * w, x0 + i * w, 0.12);
  });
}
function posterBar(ctx, name, score, max, y, labelW) {
  posterText(ctx, name, 80, y + 26, 26, P_IVORY, 500);
  const bx = labelW, bw = 920 + 80 - bx - 110;
  ctx.fillStyle = "rgba(244,240,228,.10)"; posterRound(ctx, bx, y + 8, bw, 14, 7); ctx.fill();
  ctx.fillStyle = P_GOLD; posterRound(ctx, bx, y + 8, Math.max(10, bw * score / max), 14, 7); ctx.fill();
  posterText(ctx, typeof score === "number" ? String(score) : score, 1000, y + 26, 27, P_IVORY, 600, "right");
}
function openPoster(canvas, filename, tip) {
  state.posterName = filename;
  document.getElementById("poster-img").src = canvas.toDataURL("image/png");
  document.getElementById("poster-tip").textContent =
    tip || "已生成。手机上长按图片即可保存到相册；电脑上点下面的按钮下载。";
  document.getElementById("poster-modal").classList.add("show");
}
function closePoster() { document.getElementById("poster-modal").classList.remove("show"); }
function downloadPoster() {
  const img = document.getElementById("poster-img");
  const a = document.createElement("a");
  a.href = img.src; a.download = state.posterName || "一粒麦子-训练系统.png";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  document.getElementById("poster-tip").textContent = "已开始下载，去相册或「下载」里看看。";
}

function posterExam() {
  const d = lastPosterData;
  if (!d) { alert("还没有可以生成的成绩单"); return; }
  const r = d.record;
  const { c, ctx } = posterCtx();
  posterBase(ctx, "模考成绩单");

  posterText(ctx, r.title, 540, 300, 42, P_IVORY, 700, "center");
  posterBigScore(ctx, String(r.score), "分", 500, 196);
  posterText(ctx,
    r.score >= 90 ? "优秀 · 状态很好" : r.score >= 80 ? "良好 · 再补补错题"
      : r.score >= 60 ? "及格 · 还有提升空间" : "继续刷题 · 别急",
    540, 570, 30, P_MUTED, 500, "center");

  posterStatRow(ctx, [["已做", r.answered], ["答对", r.correct],
    ["答错", r.wrongAnswered != null ? r.wrongAnswered : r.wrong], ["用时", r.time]], 700);
  posterHair(ctx, 760, 80, 1000, 0.12);

  const multi = d.results && d.results.length > 1;
  if (multi) {
    posterText(ctx, "各模块", 80, 830, 26, P_GOLD, 600);
    let y = 870;
    d.results.forEach(m => { posterBar(ctx, m.name, m.score, 100, y, 300); y += 72; });
  } else {
    posterText(ctx, "本次共 " + r.total + " 题" +
      (r.total - r.answered > 0 ? "，未作答 " + (r.total - r.answered) + " 题" : ""),
      540, 900, 29, P_MUTED, 400, "center");
    posterText(ctx, "再测一次，看看有没有进步", 540, 1050, 30, P_IVORY, 500, "center");
  }
  posterText(ctx, (r.date || "").split(" ")[0], 540, 1150, 23, P_FAINT, 400, "center");

  posterFooterNote(ctx, "成绩仅供参考");
  openPoster(c, "一粒麦子-模考成绩单.png", "成绩单已生成。手机上长按图片可保存到相册；电脑上点「保存图片」。");
}

function posterMine() {
  const days = Object.keys(state.daily).filter(k => state.daily[k] && state.daily[k].count > 0);
  let totalQ = 0, correctQ = 0;
  days.forEach(k => { totalQ += state.daily[k].count; correctQ += state.daily[k].correct || 0; });
  const finished = state.history.filter(h => !h.incomplete);
  const best = finished.reduce((a, b) => (b.score > (a ? a.score : -1) ? b : a), null);
  const acc = totalQ ? Math.round(correctQ / totalQ * 100) : 0;

  const { c, ctx } = posterCtx();
  posterBase(ctx, "学习战报");
  posterText(ctx, "我的学习战报", 540, 300, 46, P_IVORY, 700, "center");

  posterStatRow(ctx, [["累计做题", totalQ + " 题"], ["累计天数", days.length + " 天"],
    ["平均正确率", acc + "%"], ["完成模考", finished.length + " 场"]], 430);
  posterHair(ctx, 500, 80, 1000, 0.12);

  if (best) {
    posterText(ctx, "最好的一次", 80, 580, 26, P_GOLD, 600);
    posterText(ctx, best.title, 80, 640, 36, P_IVORY, 600);
    posterBigScore(ctx, String(best.score), "分", 780, 132);
    posterText(ctx, (best.date || "").split(" ")[0], 540, 830, 22, P_FAINT, 400, "center");
  } else {
    posterText(ctx, "还没考过模考，先去首页挑一场试试。", 540, 660, 30, P_MUTED, 400, "center");
  }
  posterHair(ctx, 900, 80, 1000, 0.12);
  posterText(ctx, "错题本 " + state.wrong.length + " 题   收藏 " + state.favorites.length + " 题",
    540, 960, 28, P_MUTED, 400, "center");
  posterText(ctx, days.length ? "每天 20 分钟，坚持一个月就能看出变化。" : "开始第一天，先把今天的题做了。",
    540, 1060, 28, P_IVORY, 400, "center");

  posterFooterNote(ctx, "数据存在本机浏览器");
  openPoster(c, "一粒麦子-学习战报.png", "战报已生成。手机上长按图片保存，电脑上点「保存图片」。");
}

function posterCalc() {
  const dims = window.__calcDims;
  if (!dims) { alert("先点「开始计算」算出分数"); return; }
  const total = window.__calcTotal || dims.reduce((s, d) => s + d.score, 0);
  const { c, ctx } = posterCtx();
  posterBase(ctx, "五维四型分数单");
  posterText(ctx, "五维四型 · 参考总分", 540, 300, 38, P_IVORY, 700, "center");
  posterBigScore(ctx, total.toFixed(1), "/ 500 分", 520, 176);
  posterHair(ctx, 580, 80, 1000, 0.12);

  let y = 640;
  dims.forEach(d => { posterBar(ctx, d.name, d.score.toFixed(1), 100, y, 360); y += 92; });
  posterText(ctx, "据 2026 年 9 月定兵经验：总分 410 分左右比较稳，各地竞争不同，仅供参考。",
    540, 1180, 24, P_MUTED, 400, "center");

  posterFooterNote(ctx, "依据公开标准估算");
  openPoster(c, "一粒麦子-五维四型分数单.png", "分数单已生成。手机上长按图片保存，电脑上点「保存图片」。");
}

/* 保存图片（收款码长按之外的兜底）：用 <a download> 触发下载 */
function saveImage(imgId, filename) {
  const img = document.getElementById(imgId);
  if (!img) return;
  const a = document.createElement("a");
  a.href = img.src;
  a.download = filename;
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
document.addEventListener("change", e => {
  if (e.target.id === "set-instant") settings.instant = e.target.checked;
  if (e.target.id === "set-autonext") settings.autoNext = e.target.checked;
  save(K.settings, settings);
});

/* ============ 文件下载/上传 ============ */
function downloadFile(name, text) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function readJsonFile(file, cb) {
  const reader = new FileReader();
  reader.onload = () => {
    try { cb(JSON.parse(reader.result)); }
    catch (e) { alert("文件不是有效的JSON"); }
  };
  reader.readAsText(file, "utf-8");
}

/* ============ 学习数据备份 ============ */
function exportAllData() {
  const data = {
    version: 1, time: new Date().toISOString(),
    wrong: state.wrong, favorites: state.favorites,
    doubtful: state.doubtful, suspect: state.suspect,
    history: state.history, cstat: state.cstat,
    daily: state.daily, settings: settings
  };
  downloadFile("考试系统数据备份_" + todayStr() + ".json", JSON.stringify(data, null, 2));
}
function importAllData(e) {
  const file = e.target.files[0];
  if (!file) return;
  readJsonFile(file, data => {
    if (!data.version) { alert("备份文件格式不对"); return; }
    if (confirm("将用备份覆盖当前学习数据，确定？")) {
      state.wrong = data.wrong || [];
      state.favorites = data.favorites || [];
      state.doubtful = data.doubtful || [];
      state.suspect = data.suspect || [];
      state.history = data.history || [];
      state.cstat = data.cstat || {};
      state.daily = data.daily || {};
      settings = Object.assign({}, DEFAULT_SETTINGS, data.settings || {});
      saveAll();
      location.reload();
    }
  });
  e.target.value = "";
}

/* ============ 初始化 ============ */
(function init() {
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { closeModal(); }
    if (state.view === "exam" && exam) {
      if (e.key === "ArrowLeft") prevQuestion();
      if (e.key === "ArrowRight") nextQuestion();
      // 电脑端：考试界面里回车统一接管——答完本题直接进下一题。
      // 先 preventDefault，避免回车去“点”当前聚焦的按钮（例如先前点过的退出键）。
      if (e.key === "Enter" && !document.getElementById("modal").classList.contains("show")) {
        e.preventDefault();
        const ae = document.activeElement;
        if (ae && ae.tagName === "BUTTON") ae.blur();
        const m = cm();
        const rec = m.answers[i];
        if (rec && rec.answered) nextQuestion();
      }
    }
  });
  if (!QUESTIONS.length) {
    alert("题库文件缺失：请确保「题库.js」与本程序放在同一文件夹中。");
    return;
  }
  navigate("home");
})();

window.addEventListener("load",function(){var m=document.getElementById("boot-mask");if(m){m.className="off";setTimeout(function(){m.remove()},320);}});



// 春季走兵倒计时 目标 2027-03-01 00:00:00，无localStorage缓存，单日只算一次
const targetDate = new Date('2027-03-01 00:00:00');
let renderDay = null;
let showDays = 0;

function setBingDay() {
  const todayKey = new Date().toDateString();
  // 当天已经算过，直接返回，不再重新计算
  if (renderDay === todayKey) {
    document.getElementById('cd-bing-days').innerText = showDays;
    return;
  }
  // 新的一天，重新计算
  const now = new Date();
  const diffTime = targetDate - now;
  if (diffTime <= 0) {
    showDays = 0;
  } else {
    showDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }
  renderDay = todayKey;
  document.getElementById('cd-bing-days').innerText = showDays;
}

setBingDay();



