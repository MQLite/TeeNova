const ROOT = 'https://www.otahuhuprint.com/api/gmail-reception/';
const CARD = CardService;
const LIMIT = 8 * 1024 * 1024;

function html(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function section() { return CARD.newCardSection(); }
function note(text) { return CARD.newTextParagraph().setText(text); }
function card(title, body) {
  return CARD.newCardBuilder().setHeader(CARD.newCardHeader().setTitle(title)).addSection(body).build();
}
function button(label, handler, parameters) {
  return CARD.newTextButton().setText(label).setOnClickAction(
    CARD.newAction().setFunctionName(handler).setParameters(parameters || {}));
}
function next(title, body) {
  return CARD.newActionResponseBuilder().setNavigation(CARD.newNavigation().pushCard(card(title, body))).build();
}
function notification(text) {
  return CARD.newActionResponseBuilder().setNotification(CARD.newNotification().setText(text)).build();
}
function home() { return card('收设计稿', section().addWidget(note('打开带设计附件的客户邮件，然后选择要关联的文件。'))); }

function attachments(e) {
  if (!e.gmail || !e.gmail.accessToken) throw Error('请重新打开原邮件。');
  GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
  return GmailApp.getMessageById(e.gmail.messageId).getAttachments({includeInlineImages:false, includeAttachments:true});
}
function intake(e) {
  const files = attachments(e);
  const box = CARD.newSelectionInput().setFieldName('files').setTitle('选择设计附件').setType(CARD.SelectionInputType.CHECK_BOX);
  let available = 0;
  files.forEach((file, i) => {
    if (/\.(pdf|png|jpe?g)$/i.test(file.getName()) && file.getSize() <= LIMIT) {
      box.addItem(file.getName(), String(i), false); available++;
    }
  });
  const body = section();
  if (!available) return card('收设计稿', body.addWidget(note('这封邮件没有可选的 PDF、PNG 或 JPEG 附件（每次合计最多 8 MB）。')));
  body.addWidget(box).addWidget(button('存入待关联设计稿','savePending',{message:e.gmail.messageId}))
    .addWidget(CARD.newTextInput().setFieldName('search').setTitle('工单号、客户姓名或电话'))
    .addWidget(button('查找已有工单','findSheets',{message:e.gmail.messageId}));
  return card('收设计稿', body);
}
function fetchSite(path, options) {
  const response = UrlFetchApp.fetch(ROOT + path, Object.assign({
    headers:{Authorization:'Bearer ' + ScriptApp.getIdentityToken()}, muteHttpExceptions:true, followRedirects:false
  }, options || {}));
  const code = response.getResponseCode();
  if (code === 401 || code === 403) throw Error('此门店账号尚未连接正式站，请联系管理员。');
  let body;
  try { body = JSON.parse(response.getContentText()); } catch (_) { throw Error('正式站没有返回操作结果，请重新打开插件后重试。'); }
  if (code !== 200) throw Error(body.message || ('正式站暂时无法完成操作（' + code + '），请重试。'));
  return body;
}
function selected(e, params) {
  if (!e.gmail || params.message !== e.gmail.messageId) throw Error('当前邮件已改变，请重新选择附件。');
  const all = attachments(e);
  const slots = params.slots.split(',');
  if (!slots.length || slots.length > 10 || new Set(slots).size !== slots.length) throw Error('每次请选择 1 到 10 个附件。');
  const files = slots.map(slot => {
    if (!/^(0|[1-9]\d{0,3})$/.test(slot) || !all[Number(slot)]) throw Error('请重新选择附件。');
    return {slot:slot, file:all[Number(slot)]};
  });
  if (files.reduce((sum, f) => sum + f.file.getSize(), 0) > LIMIT) throw Error('每次所选附件合计最多 8 MB。');
  return files;
}
function findSheets(e) {
  try {
    const inputs = e.commonEventObject.formInputs || {};
    const slots = inputs.files && inputs.files.stringInputs.value;
    const query = ((inputs.search && inputs.search.stringInputs.value[0]) || '').trim();
    if (!slots || !slots.length) return notification('请先勾选附件。');
    if (query.length < 2 || query.length > 160) return notification('请输入至少两个字符查找工单。');
    const params = {message:e.commonEventObject.parameters.message, slots:slots.join(',')};
    selected(e, params);
    const result = fetchSite('sheets?search=' + encodeURIComponent(query));
    if (!result.items.length) return notification('没有匹配的已有工单，请核对查询内容。');
    const body = section();
    if (result.more) body.addWidget(note('仅显示前 10 张匹配工单，可返回缩小搜索范围。'));
    result.items.forEach(s => {
      const label = (s.customer || '未填写姓名') + ' · #' + s.id.slice(0,8);
      const detail = [s.pickupDate ? '取货 '+s.pickupDate : '取货日期待定', s.phoneEnd ? '电话尾号 '+s.phoneEnd : ''].filter(Boolean).join(' · ');
      body.addWidget(note(html(label)+'<br>'+html(detail))).addWidget(button('选择此工单','confirmSheet',
        Object.assign({},params,{sheet:s.id,label:label,detail:detail})));
    });
    return next('选择已有工单',body);
  } catch (err) { return notification(err.message); }
}
function confirmSheet(e) {
  try {
    const p = e.commonEventObject.parameters;
    const files = selected(e,p);
    const body = section().addWidget(note(html(p.label)+'<br>'+html(p.detail)))
      .addWidget(note(files.map(f=>html(f.file.getName())).join('<br>')))
      .addWidget(button('确认关联','associate',p));
    return next('核对工单和附件',body);
  } catch (err) { return notification(err.message); }
}
function associate(e) {
  try {
    const p = e.commonEventObject.parameters;
    if (!/^[0-9a-f-]{36}$/i.test(p.sheet)) throw Error('请选择有效工单。');
    const files = selected(e,p);
    const payload = {messageId:GmailApp.getMessageById(e.gmail.messageId).getId()};
    files.forEach(f=>{payload['file'+f.slot] = f.file.copyBlob().setName(f.file.getName());});
    const result = fetchSite('sheets/'+p.sheet+'/attachments',{method:'post',payload:payload});
    if (result.sheetId !== p.sheet || result.count !== files.length || !Number.isInteger(result.added) ||
        result.added < 0 || result.added > files.length) throw Error('尚未确认关联结果，请重试。');
    return next('已关联',section().addWidget(note(html(p.label)+'<br>'+files.map(f=>html(f.file.getName())).join('<br>')))
      .addWidget(note(result.added ? '所选附件已存入这张工作单。' : '所选附件已经在这张工作单中。')));
  } catch (err) { return notification(err.message); }
}

function savePending(e) {
  try {
    const input = (e.commonEventObject.formInputs || {}).files;
    if (!input || !input.stringInputs.value.length) return notification('请先勾选要暂存的附件。');
    const files = selected(e,{message:e.commonEventObject.parameters.message, slots:input.stringInputs.value.join(',')});
    const message = GmailApp.getMessageById(e.gmail.messageId);
    const payload = {messageId:message.getId(), sender:message.getFrom(), subject:message.getSubject(),
      received:message.getDate().toISOString()};
    files.forEach(f=>{payload['file'+f.slot] = f.file.copyBlob().setName(f.file.getName());});
    const result = fetchSite('pending',{method:'post',payload:payload});
    if (result.sheetId !== '00000000-0000-0000-0000-000000000000' || result.count !== files.length ||
        !Number.isInteger(result.added) || result.added < 0 || result.added > files.length)
      throw Error('暂存结果未确认，请重试。');
    return next('已存入待关联设计稿',section().addWidget(note(files.map(f=>html(f.file.getName())).join('<br>')))
      .addWidget(note(result.added ? '接待工作台可用此稿开单或关联已有工单。' : '这些附件已在待关联列表中。')));
  } catch (err) { return notification(err.message); }
}

// Run once from the editor to configure the website audience. Logs only the public client ID.
function showClientId() {
  const payload = ScriptApp.getIdentityToken().split('.')[1];
  console.log(JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(payload)).getDataAsString()).aud);
}
