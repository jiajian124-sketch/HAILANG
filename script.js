// 简单本地出入库管理（基于 localStorage），无后端依赖

const STORAGE_KEY = "inventory-app-data-v1";

const state = {
  customers: [],
  products: [],
  inboundRecords: [],
  outboundRecords: [],
};

let imageModalController = null;

// ---------- 工具函数 ----------

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    Object.assign(state, data);
  } catch (e) {
    console.error("加载数据失败", e);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid() {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  ).toUpperCase();
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  return dateStr;
}

function formatNumber(n, digits = 2) {
  const num = Number(n || 0);
  if (Number.isNaN(num)) return "";
  return num.toFixed(digits);
}

function parseDateMonth(dateStr) {
  // 返回 "YYYY-MM" 方便比较月份
  if (!dateStr) return "";
  return dateStr.slice(0, 7);
}

// ---------- 事件绑定入口 ----------

document.addEventListener("DOMContentLoaded", () => {
  loadState();
  initTabs();
  initForms();
  initButtons();
  initFormToggle();
  initImageModal();
  renderAll();
});

// ---------- Tab 切换 ----------

function initTabs() {
  const buttons = document.querySelectorAll(".tab-btn");
  const panels = document.querySelectorAll(".tab-panel");

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      buttons.forEach((b) => b.classList.toggle("active", b === btn));
      panels.forEach((p) =>
        p.classList.toggle("hidden", p.dataset.tab !== tab)
      );
    });
  });
}

// ---------- 表单与按钮初始化 ----------

function initForms() {
  // 客户
  const customerForm = document.getElementById("customer-form");
  customerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(customerForm);
    const customer = {
      id: customerForm.dataset.editId || uid(),
      name: fd.get("name").trim(),
      phone: fd.get("phone").trim(),
      driverPhone: fd.get("driverPhone").trim(),
      address: fd.get("address").trim(),
      note: fd.get("note").trim(),
    };
    if (!customer.name) {
      alert("客户名称不能为空");
      return;
    }
    const existsIndex = state.customers.findIndex(
      (c) => c.id === customer.id
    );
    if (existsIndex >= 0) {
      state.customers[existsIndex] = customer;
    } else {
      state.customers.push(customer);
    }
    customerForm.reset();
    customerForm.dataset.editId = "";
    saveState();
    renderCustomers();
    renderCustomerOptions();
    alert("客户已保存");
  });

  // 产品
  const productForm = document.getElementById("product-form");
  productForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(productForm);
    const product = {
      id: productForm.dataset.editId || uid(),
      sku: fd.get("sku").trim(),
      name: fd.get("name").trim(),
      spec: fd.get("spec").trim(),
      unit: fd.get("unit").trim(),
      price: Number(fd.get("price") || 0),
      currency: fd.get("currency") || "CNY",
      safeStock: Number(fd.get("safeStock") || 0),
      note: fd.get("note").trim(),
    };
    if (!product.name) {
      alert("产品名称不能为空");
      return;
    }
    const existsIndex = state.products.findIndex((p) => p.id === product.id);
    if (existsIndex >= 0) {
      state.products[existsIndex] = product;
    } else {
      state.products.push(product);
    }
    productForm.reset();
    productForm.dataset.editId = "";
    saveState();
    renderInventory();
    renderProductOptions();
    alert("产品已保存");
  });

  // 入库
  const inboundForm = document.getElementById("inbound-form");
  inboundForm.date.valueAsDate = new Date();
  inboundForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(inboundForm);
    const qty = Number(fd.get("qty") || 0);
    const productId = fd.get("productId");
    // 从产品信息中自动获取价格和币种
    const product = state.products.find((p) => p.id === productId);
    const price = product ? (product.price || 0) : 0;
    const currency = product ? (product.currency || "CNY") : "CNY";
    const amount = qty * price;
    const record = {
      id: uid(),
      date: fd.get("date"),
      customerId: fd.get("customerId") || "",
      productId: productId,
      qty,
      price,
      amount,
      currency: currency,
      note: fd.get("note").trim(),
    };
    if (!record.date || !record.productId || !qty) {
      alert("请填写完整入库信息（日期、产品、数量）");
      return;
    }
    state.inboundRecords.push(record);
    inboundForm.reset();
    inboundForm.date.valueAsDate = new Date();
    saveState();
    renderInventory();
    renderInbound();
  });

  // 出库
  const outboundForm = document.getElementById("outbound-form");
  outboundForm.date.valueAsDate = new Date();
  outboundForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const editingId = outboundForm.dataset.editId || "";
    const isEditing = !!editingId;
    const existing = isEditing
      ? state.outboundRecords.find((r) => r.id === editingId)
      : null;
    const fd = new FormData(outboundForm);
    const qty = Number(fd.get("qty") || 0);
    const price = Number(fd.get("price") || 0);
    const amount = qty * (price || 0);

    const finishSave = (imageData) => {
      const record = {
        id: isEditing ? editingId : uid(),
        date: fd.get("date"),
        customerId: fd.get("customerId"),
        productId: fd.get("productId"),
        qty,
        price,
        amount,
        currency:
          fd.get("currency") || inferProductCurrency(fd.get("productId")),
        paymentStatus: fd.get("paymentStatus") || "unpaid",
        note: fd.get("note").trim(),
        imageData: imageData || "",
      };
      if (
        !record.date ||
        !record.customerId ||
        !record.productId ||
        !qty
      ) {
        alert("请填写完整出库信息（日期、客户、产品、数量）");
        return;
      }
      if (isEditing) {
        const idx = state.outboundRecords.findIndex(
          (r) => r.id === editingId
        );
        if (idx >= 0) {
          state.outboundRecords[idx] = record;
        }
      } else {
        state.outboundRecords.push(record);
      }
      outboundForm.reset();
      outboundForm.date.valueAsDate = new Date();
      outboundForm.dataset.editId = "";
      saveState();
      renderInventory();
      renderOutbound();
      // 如果当前在客户统计页，也刷新一下
      const activeTab = document.querySelector(".tab-btn.active")
        ?.dataset.tab;
      if (activeTab === "reports") {
        renderReport();
      }
    };

    const fileInput = outboundForm.image;
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        finishSave(reader.result);
      };
      reader.readAsDataURL(file);
    } else {
      const prevImage = existing && existing.imageData;
      finishSave(prevImage || "");
    }
  });

  outboundForm.price.addEventListener("input", () =>
    syncAmount(outboundForm, "qty", "price", "amount")
  );
  outboundForm.qty.addEventListener("input", () =>
    syncAmount(outboundForm, "qty", "price", "amount")
  );

  // 当选择产品时，自动带出默认单价和币种（出库表单）
  const outboundProductSelect = outboundForm.querySelector('select[name="productId"]');
  const outboundPriceInput = outboundForm.querySelector('input[name="price"]');
  const outboundCurrencySelect = outboundForm.querySelector('select[name="currency"]');
  
  if (outboundProductSelect && outboundPriceInput && outboundCurrencySelect) {
    outboundProductSelect.addEventListener("change", () => {
      const productId = outboundProductSelect.value;
      const p = state.products.find((x) => x.id === productId);
      if (p) {
        // 自动填充单价
        if (p.price) {
          outboundPriceInput.value = p.price;
        }
        // 自动填充币种
        if (p.currency) {
          outboundCurrencySelect.value = p.currency;
        }
        // 如果数量已填写，自动计算金额
        const qty = Number(outboundForm.querySelector('input[name="qty"]').value || 0);
        if (qty > 0) {
          syncAmount(outboundForm, "qty", "price", "amount");
        }
      }
    });
  }

  // 统计筛选
  const reportForm = document.getElementById("report-filter-form");
  reportForm.addEventListener("submit", (e) => {
    e.preventDefault();
    renderReport();
  });
}

function initButtons() {
  // 导出 CSV
  document
    .getElementById("export-customers")
    .addEventListener("click", () => {
      const rows = [
        ["客户名称", "电话", "司机电话", "地址", "备注"],
        ...state.customers.map((c) => [
          c.name,
          c.phone,
          c.driverPhone || "",
          c.address,
          c.note,
        ]),
      ];
      downloadCSV("客户信息.csv", rows);
    });

  document
    .getElementById("export-inventory")
    .addEventListener("click", () => {
      const rows = [
        [
          "产品编号",
          "产品名称",
          "规格",
          "单位",
          "默认单价",
          "币种",
          "当前库存",
          "安全库存",
          "状态",
          "备注",
        ],
      ];
      state.products.forEach((p) => {
        const stock = calcProductStock(p.id);
        rows.push([
          p.sku,
          p.name,
          p.spec,
          p.unit,
          formatNumber(p.price),
          p.currency || "",
          formatNumber(stock),
          p.safeStock,
          stock < 0
            ? "库存为负"
            : stock < p.safeStock
            ? "低于安全库存"
            : "正常",
          p.note || "",
        ]);
      });
      downloadCSV("产品库存.csv", rows);
    });

  document
    .getElementById("export-inbound")
    .addEventListener("click", () => {
      const rows = [
        ["日期", "供应商/客户", "产品", "数量", "备注"],
      ];
      state.inboundRecords.forEach((r) => {
        rows.push([
          formatDate(r.date),
          findCustomerName(r.customerId),
          findProductName(r.productId),
          formatNumber(r.qty),
          r.note,
        ]);
      });
      downloadCSV("入库明细.csv", rows);
    });

  document
    .getElementById("export-outbound")
    .addEventListener("click", () => {
      const rows = [
        [
          "日期",
          "客户",
          "产品",
          "数量",
          "单价",
          "金额",
          "币种",
          "订单状态",
          "备注",
        ],
      ];
      state.outboundRecords.forEach((r) => {
        rows.push([
          formatDate(r.date),
          findCustomerName(r.customerId),
          findProductName(r.productId),
          formatNumber(r.qty),
          formatNumber(r.price),
          formatNumber(r.amount),
          r.currency || "",
          formatPaymentStatus(r.paymentStatus),
          r.note,
        ]);
      });
      downloadCSV("出库明细.csv", rows);
    });

  // 入库 / 出库月份筛选
  document
    .getElementById("inbound-filter-month")
    .addEventListener("input", renderInbound);
  document
    .getElementById("outbound-filter-month")
    .addEventListener("input", renderOutbound);

  const exportBackupBtn = document.getElementById("export-backup");
  const importBackupInput = document.getElementById("import-backup-input");

  if (exportBackupBtn) {
    exportBackupBtn.addEventListener("click", () => {
      const snapshot = JSON.stringify(state, null, 2);
      const filename = `inventory-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      downloadJSON(filename, snapshot);
    });
  }

  if (importBackupInput) {
    importBackupInput.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          if (!isValidBackup(parsed)) {
            throw new Error("备份文件格式不正确");
          }
          const hasExisting =
            state.customers.length +
              state.products.length +
              state.inboundRecords.length +
              state.outboundRecords.length >
            0;
          if (
            hasExisting &&
            !confirm("导入备份会覆盖当前数据，确定继续吗？")
          ) {
            importBackupInput.value = "";
            return;
          }
          state.customers = Array.isArray(parsed.customers)
            ? parsed.customers
            : [];
          state.products = Array.isArray(parsed.products)
            ? parsed.products
            : [];
          state.inboundRecords = Array.isArray(parsed.inboundRecords)
            ? parsed.inboundRecords
            : [];
          state.outboundRecords = Array.isArray(parsed.outboundRecords)
            ? parsed.outboundRecords
            : [];
          saveState();
          renderAll();
          alert("备份导入成功");
        } catch (err) {
          console.error(err);
          alert("导入失败：备份文件无效或已损坏");
        } finally {
          importBackupInput.value = "";
        }
      };
      reader.readAsText(file);
    });
  }
}

function syncAmount(form, qtyName, priceName, amountName) {
  const qty = Number(form[qtyName].value || 0);
  const price = Number(form[priceName].value || 0);
  const amount = qty * (price || 0);
  form[amountName].value = amount ? amount.toFixed(2) : "";
}

// 只看表格 / 显示表单+表格
function initFormToggle() {
  document.querySelectorAll(".toggle-forms").forEach((btn) => {
    const panel = btn.closest(".tab-panel");
    btn.addEventListener("click", () => {
      const hide = !panel.classList.contains("hide-forms");
      panel.classList.toggle("hide-forms", hide);
      btn.textContent = hide ? "显示表单+表格" : "只看表格";
    });
  });
}

// ---------- 渲染 ----------

function renderAll() {
  renderCustomers();
  renderInventory();
  renderInbound();
  renderOutbound();
  renderCustomerOptions();
  renderProductOptions();
  renderReportCustomerOptions();
}

// 客户表格
function renderCustomers() {
  const tbody = document.getElementById("customer-table-body");
  tbody.innerHTML = "";
  state.customers.forEach((c) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${c.name || ""}</td>
      <td>${c.phone || ""}</td>
      <td>${c.driverPhone || ""}</td>
      <td>${c.address || ""}</td>
      <td>${c.note || ""}</td>
      <td>
        <button class="btn ghost btn-sm" data-action="edit" data-id="${
          c.id
        }">编辑</button>
        <button class="btn ghost btn-sm" data-action="report" data-id="${
          c.id
        }">查看统计</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("button").forEach((btn) => {
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    btn.addEventListener("click", () => {
      if (action === "edit") {
        const c = state.customers.find((x) => x.id === id);
        if (!c) return;
        const form = document.getElementById("customer-form");
        form.name.value = c.name || "";
        form.phone.value = c.phone || "";
        form.driverPhone.value = c.driverPhone || "";
        form.address.value = c.address || "";
        form.note.value = c.note || "";
        form.dataset.editId = c.id;
        // 切换到客户信息 tab
        document
          .querySelector('.tab-btn[data-tab="customers"]')
          .click();
      } else if (action === "report") {
        // 跳转到统计页并预选客户
        document.querySelector('.tab-btn[data-tab="reports"]').click();
        const sel = document.getElementById("report-customer-select");
        sel.value = id;
        document.getElementById("report-month-input").value =
          new Date().toISOString().slice(0, 7);
        renderReport();
      }
    });
  });
}

// 客户下拉选项（入库/出库/统计）
function renderCustomerOptions() {
  const selects = document.querySelectorAll(
    'select[name="customerId"], #report-customer-select'
  );
  selects.forEach((sel) => {
    const isReport = sel.id === "report-customer-select";
    sel.innerHTML = "";
    if (!isReport) {
      const optEmpty = document.createElement("option");
      optEmpty.value = "";
      optEmpty.textContent = "（可选）";
      sel.appendChild(optEmpty);
    }
    state.customers.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      sel.appendChild(opt);
    });
  });
}

function renderReportCustomerOptions() {
  const sel = document.getElementById("report-customer-select");
  if (!sel) return;
  // 保持当前选中值
  const current = sel.value;
  renderCustomerOptions();
  if (current) sel.value = current;
}

// 产品下拉选项（入库/出库）
function renderProductOptions() {
  const selects = document.querySelectorAll(
    '#inbound-form select[name="productId"], #outbound-form select[name="productId"]'
  );
  selects.forEach((sel) => {
    sel.innerHTML = "";
    const optEmpty = document.createElement("option");
    optEmpty.value = "";
    optEmpty.textContent = "请选择产品";
    sel.appendChild(optEmpty);
    state.products.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      // 显示格式：产品名称 - 规格（如果有规格）
      const displayText = p.spec && p.spec.trim() 
        ? `${p.name} - ${p.spec}` 
        : p.name;
      opt.textContent = displayText;
      sel.appendChild(opt);
    });
  });
}

// 计算单个产品库存
function calcProductStock(productId) {
  const inQty = state.inboundRecords
    .filter((r) => r.productId === productId)
    .reduce((sum, r) => sum + Number(r.qty || 0), 0);
  const outQty = state.outboundRecords
    .filter((r) => r.productId === productId)
    .reduce((sum, r) => sum + Number(r.qty || 0), 0);
  return inQty - outQty;
}

// 产品库存表格
function renderInventory() {
  const tbody = document.getElementById("inventory-table-body");
  tbody.innerHTML = "";
  state.products.forEach((p) => {
    const stock = calcProductStock(p.id);
    let statusText = "正常";
    let statusClass = "ok";
    if (stock < 0) {
      statusText = "库存为负";
      statusClass = "low";
    } else if (stock < p.safeStock) {
      statusText = "低于安全库存";
      statusClass = "warn";
    }
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.sku || ""}</td>
      <td>${p.name || ""}</td>
      <td>${p.spec || ""}</td>
      <td>${p.unit || ""}</td>
      <td class="num-right">${formatNumber(p.price)}</td>
      <td>${p.currency || ""}</td>
      <td class="num-right">${formatNumber(stock)}</td>
      <td class="num-right">${p.safeStock || ""}</td>
      <td><span class="tag ${statusClass}">${statusText}</span></td>
      <td>${p.note || ""}</td>
      <td>
        <button class="btn ghost btn-sm" data-action="edit" data-id="${
          p.id
        }">编辑</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("button[data-action='edit']").forEach((btn) => {
    const id = btn.dataset.id;
    btn.addEventListener("click", () => {
      const p = state.products.find((x) => x.id === id);
      if (!p) return;
      const form = document.getElementById("product-form");
      form.sku.value = p.sku || "";
      form.name.value = p.name || "";
      form.spec.value = p.spec || "";
      form.unit.value = p.unit || "";
      form.price.value = p.price || "";
      form.safeStock.value = p.safeStock || "";
      form.note.value = p.note || "";
      form.dataset.editId = p.id;
      document.querySelector('.tab-btn[data-tab="inventory"]').click();
    });
  });
}

// 入库明细
function renderInbound() {
  const tbody = document.getElementById("inbound-table-body");
  const monthFilter = document.getElementById("inbound-filter-month").value;
  tbody.innerHTML = "";
  state.inboundRecords
    .filter((r) => {
      if (!monthFilter) return true;
      return parseDateMonth(r.date) === monthFilter;
    })
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    .forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatDate(r.date)}</td>
        <td>${findCustomerName(r.customerId)}</td>
        <td>${findProductName(r.productId)}</td>
        <td class="num-right">${formatNumber(r.qty)}</td>
        <td>${r.note || ""}</td>
        <td>
          <button class="btn ghost btn-sm" data-action="delete" data-id="${
            r.id
          }">删除</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

  tbody.querySelectorAll("button[data-action='delete']").forEach((btn) => {
    const id = btn.dataset.id;
    btn.addEventListener("click", () => {
      if (!confirm("确定删除该入库记录？")) return;
      const idx = state.inboundRecords.findIndex((r) => r.id === id);
      if (idx >= 0) {
        state.inboundRecords.splice(idx, 1);
        saveState();
        renderInventory();
        renderInbound();
      }
    });
  });
}

// 出库明细
function renderOutbound() {
  const tbody = document.getElementById("outbound-table-body");
  const monthFilter = document.getElementById("outbound-filter-month").value;
  tbody.innerHTML = "";
  state.outboundRecords
    .filter((r) => {
      if (!monthFilter) return true;
      return parseDateMonth(r.date) === monthFilter;
    })
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    .forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatDate(r.date)}</td>
        <td>${findCustomerName(r.customerId)}</td>
        <td>${findProductName(r.productId)}</td>
        <td class="num-right">${formatNumber(r.qty)}</td>
        <td class="num-right">${formatNumber(r.price)}</td>
        <td class="num-right">${formatNumber(r.amount)}</td>
        <td>${r.currency || ""}</td>
        <td>${formatPaymentStatus(r.paymentStatus)}</td>
        <td class="image-cell">
          ${
            r.imageData
              ? `<img src="${r.imageData}" class="table-thumb" alt="凭证图片" data-role="image-thumb" data-src="${r.imageData}" />`
              : "-"
          }
        </td>
        <td>${r.note || ""}</td>
        <td>
          <button class="btn ghost btn-sm" data-action="edit" data-id="${r.id}">编辑</button>
          <button class="btn ghost btn-sm" data-action="delete" data-id="${r.id}">删除</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

  tbody.querySelectorAll("button").forEach((btn) => {
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    btn.addEventListener("click", () => {
      if (action === "delete") {
        if (!confirm("确定删除该出库记录？")) return;
        const idx = state.outboundRecords.findIndex((r) => r.id === id);
        if (idx >= 0) {
          state.outboundRecords.splice(idx, 1);
          saveState();
          renderInventory();
          renderOutbound();
        }
      } else if (action === "edit") {
        startEditOutbound(id);
      }
    });
  });

  bindImagePreviewHandlers(tbody);
}

// 客户统计
function renderReport() {
  const customerId = document.getElementById("report-customer-select").value;
  const month = document.getElementById("report-month-input").value;
  const summaryDiv = document.getElementById("report-summary");
  const tbodyProduct = document.getElementById("report-product-tbody");
  const tbodyDetail = document.getElementById("report-detail-tbody");

  tbodyProduct.innerHTML = "";
  tbodyDetail.innerHTML = "";

  if (!customerId || !month) {
    summaryDiv.textContent = "请选择客户和统计月份。";
    return;
  }

  const records = state.outboundRecords.filter(
    (r) =>
      r.customerId === customerId && parseDateMonth(r.date) === month
  );

  const totalQty = records.reduce((sum, r) => sum + Number(r.qty || 0), 0);
  const totalAmount = records.reduce(
    (sum, r) => sum + Number(r.amount || 0),
    0
  );
  summaryDiv.innerHTML = `
    客户 <strong>${findCustomerName(customerId)}</strong> 在
    <strong>${month}</strong> 月，共出库
    <strong>${formatNumber(totalQty)}</strong> 件，
    合计金额 <strong>${formatNumber(totalAmount)}</strong> 元。
  `;

  // 按产品汇总
  const byProduct = new Map();
  records.forEach((r) => {
    const key = r.productId;
    const prev = byProduct.get(key) || { qty: 0, amount: 0 };
    prev.qty += Number(r.qty || 0);
    prev.amount += Number(r.amount || 0);
    byProduct.set(key, prev);
  });

  Array.from(byProduct.entries()).forEach(([productId, v]) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${findProductName(productId)}</td>
      <td class="num-right">${formatNumber(v.qty)}</td>
      <td class="num-right">${formatNumber(v.amount)}</td>
    `;
    tbodyProduct.appendChild(tr);
  });

  // 每日明细
  records
    .slice()
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    .forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatDate(r.date)}</td>
        <td>${findProductName(r.productId)}</td>
        <td class="num-right">${formatNumber(r.qty)}</td>
        <td class="num-right">${formatNumber(r.price)}</td>
        <td class="num-right">${formatNumber(r.amount)}</td>
        <td>${r.currency || ""}</td>
        <td>
          <select data-role="status-select" data-id="${r.id}">
            <option value="unpaid"${
              r.paymentStatus === "unpaid" ? " selected" : ""
            }>未付款</option>
            <option value="partial"${
              r.paymentStatus === "partial" ? " selected" : ""
            }>部分付款</option>
            <option value="paid"${
              r.paymentStatus === "paid" ? " selected" : ""
            }>已付款</option>
          </select>
        </td>
        <td>${r.note || ""}</td>
        <td>
          ${
            r.imageData
              ? `<img src="${r.imageData}" class="table-thumb" alt="凭证图片" data-role="image-thumb" data-src="${r.imageData}" />`
              : "-"
          }
        </td>
        <td>
          <button class="btn ghost btn-sm" data-action="edit" data-id="${r.id}">编辑</button>
        </td>
      `;
      tbodyDetail.appendChild(tr);
    });

  // 客户统计中的“编辑”按钮，跳转到出库页面并填充表单
  tbodyDetail
    .querySelectorAll("button[data-action='edit']")
    .forEach((btn) => {
      const id = btn.dataset.id;
      btn.addEventListener("click", () => {
        startEditOutbound(id);
      });
    });

  // 客户统计中的订单状态下拉，修改后直接保存
  tbodyDetail
    .querySelectorAll('select[data-role="status-select"]')
    .forEach((sel) => {
      const id = sel.dataset.id;
      sel.addEventListener("change", () => {
        const rec = state.outboundRecords.find((r) => r.id === id);
        if (!rec) return;
        rec.paymentStatus = sel.value;
        saveState();
        renderOutbound();
        // 不强制刷新整张统计表，避免闪烁；如果你希望也刷新，可以取消注释放开：
        // renderReport();
      });
    });

  bindImagePreviewHandlers(tbodyDetail);
}

// ---------- 辅助查找 ----------

function findCustomerName(id) {
  if (!id) return "";
  const c = state.customers.find((x) => x.id === id);
  return c ? c.name : "";
}

function findProductName(id) {
  if (!id) return "";
  const p = state.products.find((x) => x.id === id);
  return p ? p.name : "";
}

function inferProductCurrency(productId) {
  const p = state.products.find((x) => x.id === productId);
  return (p && p.currency) || "CNY";
}

function formatPaymentStatus(status) {
  switch (status) {
    case "paid":
      return "已付款";
    case "partial":
      return "部分付款";
    case "unpaid":
    default:
      return "未付款";
  }
}

// 从出库记录进入编辑模式
function startEditOutbound(id) {
  const record = state.outboundRecords.find((r) => r.id === id);
  if (!record) return;
  const form = document.getElementById("outbound-form");
  form.date.value = record.date || "";
  form.customerId.value = record.customerId || "";
  form.productId.value = record.productId || "";
  form.qty.value = record.qty || "";
  form.price.value = record.price || "";
  form.currency.value = record.currency || inferProductCurrency(record.productId);
  form.amount.value = record.amount || "";
  form.paymentStatus.value = record.paymentStatus || "unpaid";
  form.note.value = record.note || "";
  form.dataset.editId = record.id;
  // 清空文件选择框，防止误以为已有文件
  if (form.image) {
    form.image.value = "";
  }
  document.querySelector('.tab-btn[data-tab="outbound"]').click();
}

// ---------- 导出 CSV ----------

function downloadCSV(filename, rows) {
  const lines = rows.map((row) =>
    row
      .map((cell) => {
        if (cell == null) return "";
        const s = String(cell).replace(/"/g, '""');
        if (s.search(/("|,|\n)/g) >= 0) {
          return `"${s}"`;
        }
        return s;
      })
      .join(",")
  );
  const csv = "\uFEFF" + lines.join("\n"); // 加 BOM 解决 Excel 中文乱码
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadJSON(filename, jsonText) {
  const blob = new Blob([jsonText], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function isValidBackup(data) {
  if (!data || typeof data !== "object") return false;
  return ["customers", "products", "inboundRecords", "outboundRecords"].every(
    (key) => key in data
  );
}

function initImageModal() {
  const modal = document.getElementById("image-modal");
  const imgEl = document.getElementById("image-modal-img");
  const closeBtn = document.getElementById("image-modal-close");
  const backdrop = modal?.querySelector("[data-role='close-modal']");
  if (!modal || !imgEl) return;

  const close = () => {
    modal.classList.remove("visible");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    imgEl.src = "";
  };

  closeBtn?.addEventListener("click", close);
  backdrop?.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("visible")) {
      close();
    }
  });

  imageModalController = {
    open: (src) => {
      if (!src) return;
      imgEl.src = src;
      modal.classList.add("visible");
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-open");
    },
    close,
  };
}

function bindImagePreviewHandlers(container) {
  if (!container || !imageModalController) return;
  container
    .querySelectorAll('img[data-role="image-thumb"]')
    .forEach((img) => {
      img.addEventListener("click", () => {
        const src = img.dataset.src || img.src;
        imageModalController.open(src);
      });
    });
}


// =========================
// 图片缩放 + 拖拽
// =========================
const modal = document.getElementById("image-modal");
const img = document.getElementById("image-modal-img");

let scale = 1;
let posX = 0, posY = 0;
let isDragging = false;
let startX = 0, startY = 0;

// 打开图片时重置
function resetImageTransform() {
  scale = 1;
  posX = 0;
  posY = 0;
  img.style.transform = `translate(0px, 0px) scale(1)`;
}

// 鼠标滚轮缩放
img.addEventListener("wheel", function (e) {
  e.preventDefault();
  const delta = e.deltaY < 0 ? 0.1 : -0.1;
  scale = Math.min(Math.max(0.5, scale + delta), 5);
  img.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
});

// 拖拽开始
img.addEventListener("mousedown", function (e) {
  isDragging = true;
  img.style.cursor = "grabbing";
  startX = e.clientX - posX;
  startY = e.clientY - posY;
});

// 拖拽中
window.addEventListener("mousemove", function (e) {
  if (!isDragging) return;
  posX = e.clientX - startX;
  posY = e.clientY - startY;
  img.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
});

// 拖拽结束
window.addEventListener("mouseup", function () {
  isDragging = false;
  img.style.cursor = "grab";
});

// 双击恢复原尺寸
img.addEventListener("dblclick", () => {
  resetImageTransform();
});

// =========================
// 手机端手指缩放（双指缩放）
// =========================
let touchStartDistance = 0;

img.addEventListener("touchstart", function (e) {
  if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    touchStartDistance = Math.sqrt(dx * dx + dy * dy);
  }
});

img.addEventListener("touchmove", function (e) {
  if (e.touches.length === 2) {
    e.preventDefault();
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const newDist = Math.sqrt(dx * dx + dy * dy);
    const diff = (newDist - touchStartDistance) / 200;

    scale = Math.min(Math.max(0.5, scale + diff), 5);
    touchStartDistance = newDist;

    img.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
  }
});

