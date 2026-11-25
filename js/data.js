// Industry tracks, interviewer personas, questions (EN + 繁中) and benchmark notes.
export const INDUSTRIES = {
  ib: {
    name: { en: 'Investment Banking', zh: '投資銀行' },
    role: { en: 'Investment Banking Analyst', zh: '投資銀行分析師' },
    title: { en: 'Managing Director, Investment Banking Division', zh: '投資銀行部董事總經理' },
    keywords: ['valuation','dcf','m&a','deal','client','pitch','multiple','ebitda','irr','model','估值','併購','交易','客戶','財務模型','倍數','收益','現金流'],
    questions: [
      { en: 'Walk me through a time you built or fixed a financial analysis under a tight deadline.', zh: '請講一次你在緊迫期限下完成或修正財務分析的經歷。' },
      { en: 'Tell me about a time you had to convince a senior stakeholder who disagreed with your numbers.', zh: '講一次你需要說服一位不同意你數字的資深持份者的經歷。' },
      { en: 'Pick a recent deal you followed. Was it value-accretive for the buyer, and why?', zh: '選一宗你最近關注的交易。對買方而言是否創造價值？為什麼？' },
    ],
    benchmark: { en: 'Top-5% answers quantify the deliverable (model size, hours saved, error caught) and show judgement on what the MD actually needed.', zh: '頂尖答案會量化成果（模型規模、節省時數、發現的錯誤），並展示你理解董事總經理真正需要什麼。' },
  },
  consulting: {
    name: { en: 'Management Consulting', zh: '管理顧問' },
    role: { en: 'Business Analyst', zh: '商業分析師' },
    title: { en: 'Engagement Partner', zh: '項目合夥人' },
    keywords: ['client','hypothesis','framework','stakeholder','recommendation','market','cost','revenue','strategy','客戶','假設','框架','持份者','建議','市場','成本','收入','策略'],
    questions: [
      { en: 'Describe a problem you broke down into parts and solved with data.', zh: '描述一個你拆解問題並用數據解決的經歷。' },
      { en: 'Tell me about a time you led a team without formal authority.', zh: '講一次你在沒有正式權力下帶領團隊的經歷。' },
      { en: 'A coffee chain\'s profits fell 15% last year. How would you structure the diagnosis?', zh: '一間咖啡連鎖店去年利潤下跌15%，你會如何構建診斷框架？' },
    ],
    benchmark: { en: 'Partners listen for a MECE structure, a stated hypothesis, and a recommendation with a number attached.', zh: '合夥人會留意結構是否MECE、有否明確假設，以及建議是否附有數字。' },
  },
  accounting: {
    name: { en: 'Accounting & Audit', zh: '會計及審計' },
    role: { en: 'Audit Associate', zh: '審計助理' },
    title: { en: 'Audit Partner', zh: '審計合夥人' },
    keywords: ['audit','control','risk','reconciliation','ifrs','compliance','client','materiality','deadline','審計','內部控制','風險','對帳','合規','客戶','重要性','準則'],
    questions: [
      { en: 'Tell me about a time you found an error others had missed.', zh: '講一次你發現了別人遺漏的錯誤的經歷。' },
      { en: 'Describe how you handled competing deadlines from multiple clients or managers.', zh: '描述你如何處理多個客戶或上司的衝突期限。' },
      { en: 'A client pushes back on a proposed adjustment. How do you handle it?', zh: '客戶拒絕你建議的審計調整，你會如何處理？' },
    ],
    benchmark: { en: 'Partners want scepticism with tact: the size of the issue, how you verified it, and how you kept the client relationship.', zh: '合夥人希望看到有分寸的專業懷疑：問題規模、你如何核實，以及如何維持客戶關係。' },
  },
  tech: {
    name: { en: 'Tech & Data', zh: '科技及數據' },
    role: { en: 'Data Analyst', zh: '數據分析師' },
    title: { en: 'Head of Data & Analytics', zh: '數據及分析主管' },
    keywords: ['data','sql','python','model','dashboard','a/b','metric','pipeline','user','latency','accuracy','數據','模型','指標','用戶','準確率','自動化','系統'],
    questions: [
      { en: 'Tell me about a data project where your analysis changed a decision.', zh: '講一個你的數據分析改變了決策的項目。' },
      { en: 'Describe a time a model or pipeline you built failed. What did you do?', zh: '描述一次你建立的模型或數據流程出錯的經歷，你做了什麼？' },
      { en: 'How would you measure whether a new app feature is successful?', zh: '你會如何衡量一個新應用功能是否成功？' },
    ],
    benchmark: { en: 'Strong answers name the metric, the baseline, the method, and the business decision that moved.', zh: '強答案會說明指標、基準、方法，以及最終改變了哪個商業決策。' },
  },
  marketing: {
    name: { en: 'Marketing', zh: '市場營銷' },
    role: { en: 'Marketing Associate', zh: '市場營銷專員' },
    title: { en: 'Marketing Director', zh: '市場總監' },
    keywords: ['campaign','brand','conversion','ctr','roi','audience','budget','engagement','channel','customer','推廣','品牌','轉化率','受眾','預算','互動','渠道','顧客'],
    questions: [
      { en: 'Tell me about a campaign or content piece you ran. How did it perform?', zh: '講一個你負責的推廣活動或內容，成效如何？' },
      { en: 'Describe a time you had to work with a limited budget.', zh: '描述一次你需要在有限預算下工作的經歷。' },
      { en: 'Our brand is losing Gen-Z customers. What would you do in the first 90 days?', zh: '我們的品牌正流失Z世代顧客，你在首90日會做什麼？' },
    ],
    benchmark: { en: 'Directors look for audience insight, channel choice with a reason, and funnel numbers (reach → CTR → conversion → ROI).', zh: '總監會留意受眾洞察、有理據的渠道選擇，以及漏斗數字（觸及→點擊率→轉化→回報）。' },
  },
};

export const RUBRIC = {
  en: ['Situation: when / where / context in one sentence', 'Task: your objective and why it mattered', 'Action: what YOU decided and did ("I", not "we")', 'Result: a number — %, $, hours, users', 'Trade-off: what you gave up and why'],
  zh: ['情境：一句交代時間、地點、背景', '任務：你的目標及其重要性', '行動：「我」決定及做了什麼（而非「我們」）', '結果：一個數字——百分比、金額、時數、用戶', '權衡：你放棄了什麼，為什麼'],
};
