JF.Data = JF.Data || {};

JF.Data.DataAdapter = (function () {
  const entities = [
    "animals","heat","insemination","pregnancy","calving",
    "health","deworming","vaccination","death","purchases","sales",
    "milkSales","expenses","journal","reminders","files","dryOff","rules","ruleParameters","ruleOverrides","audit","settings","groups"
  ];

  class Interface {
    constructor() { this.entities = entities; }
    assert() { throw new Error("DataAdapter: subclass must implement all methods."); }
    async list(entity) { this.assert(); }
    async get(entity, id) { this.assert(); }
    async create(entity, data) { this.assert(); }
    async update(entity, id, data) { this.assert(); }
    async delete(entity, id) { this.assert(); }
    async seed(data) { this.assert(); }
    async clear() { this.assert(); }
    on() {}
    emit() {}
  }

  return { Interface, entities };
})();
