import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { prismaStore } from "../data/prisma-store.js";
import {
  addMiniAppInvoiceInfoV2,
  encryptPlainTextForAtour,
  getInvoiceInfoByOrder,
  getInvoiceLikeTitleOrNumber,
  issueEinvoiceV2
} from "../services/atour-order.service.js";
import { getInternalRequestContext } from "../services/internal-resource.service.js";

export const invoicesRoutes = Router();

const parseIntSafe = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

const canAccessOrder = (order, user) => {
  if (!order || !user) {
    return false;
  }
  return user.role === "ADMIN" || order.creatorId === user.id;
};

invoicesRoutes.get("/templates", requireAuth, async (req, res) => {
  const result = await prismaStore.listInvoiceTemplates({
    search: req.query.search,
    page: req.query.page,
    pageSize: req.query.pageSize,
    isEnabled: req.query.isEnabled
  });
  return res.json({ items: result.items, data: result.items, meta: result.meta });
});

invoicesRoutes.post("/templates/search-remote", requireAuth, async (req, res) => {
  const keyword = String(req.body?.titleOrNumber || "").trim();
  if (!keyword) {
    return res.status(400).json({ message: "titleOrNumber is required" });
  }
  const accountId = String(req.body?.accountId || "").trim();
  const tokenCtx = await getInternalRequestContext({
    preferredAccountId: accountId || undefined,
    minDailyOrdersLeft: 0,
    allowEnvFallback: false
  });
  if (!tokenCtx.token || !tokenCtx.proxy) {
    return res.status(400).json({ message: "暂无可用账号token或代理" });
  }

  try {
    const rows = await getInvoiceLikeTitleOrNumber({
      token: tokenCtx.token,
      proxy: tokenCtx.proxy,
      titleOrNumber: keyword
    });
    return res.json({ items: rows, accountId: tokenCtx.tokenAccountId || null });
  } catch (err) {
    return res.status(400).json({ message: err?.message || "查询抬头失败" });
  }
});

invoicesRoutes.post("/templates", requireAuth, async (req, res) => {
  const body = req.body || {};
  const invoiceName = String(body.invoiceName || "").trim();
  if (!invoiceName) {
    return res.status(400).json({ message: "invoiceName is required" });
  }

  try {
    let templatePayload = {
      invoiceId: parseIntSafe(body.invoiceId, 0),
      invoiceName,
      invoiceType: parseIntSafe(body.invoiceType, 13),
      invoiceTitleType: parseIntSafe(body.invoiceTitleType, 2),
      taxNo: body.taxNo,
      address: body.address,
      telephone: body.telephone,
      bank: body.bank,
      account: body.account,
      email: body.email,
      remark: body.remark,
      createdBy: req.auth.user.id
    };

    if (!templatePayload.invoiceId) {
      const accountId = String(body.accountId || "").trim();
      const tokenCtx = await getInternalRequestContext({
        preferredAccountId: accountId || undefined,
        minDailyOrdersLeft: 0,
        allowEnvFallback: false
      });
      if (!tokenCtx.token || !tokenCtx.proxy) {
        return res.status(400).json({ message: "新增模板需要可用账号token和代理" });
      }
      const remote = await addMiniAppInvoiceInfoV2({
        token: tokenCtx.token,
        proxy: tokenCtx.proxy,
        payload: {
          account: String(body.account || ""),
          address: String(body.address || ""),
          bank: String(body.bank || ""),
          invoiceName,
          recognitionCode: String(body.taxNo || ""),
          telephone: String(body.telephone || ""),
          type: String(parseIntSafe(body.invoiceType, 13)),
          invoiceTitleType: parseIntSafe(body.invoiceTitleType, 2),
          checkedState: 0
        }
      });
      templatePayload = {
        ...templatePayload,
        invoiceId: parseIntSafe(remote?.invoiceId, 0),
        invoiceType: parseIntSafe(remote?.type, templatePayload.invoiceType),
        invoiceTitleType: parseIntSafe(remote?.invoiceTitleType, templatePayload.invoiceTitleType),
        taxNo: remote?.recognitionCode || templatePayload.taxNo,
        address: remote?.address || templatePayload.address,
        telephone: remote?.telephone || templatePayload.telephone,
        bank: remote?.bank || templatePayload.bank,
        account: remote?.account || templatePayload.account,
        email: templatePayload.email
      };
    }

    if (!templatePayload.invoiceId) {
      return res.status(400).json({ message: "invoiceId 无效，无法保存模板" });
    }

    const created = await prismaStore.createInvoiceTemplate(templatePayload);
    return res.status(201).json(created);
  } catch (err) {
    return res.status(400).json({ message: err?.message || "创建发票模板失败" });
  }
});

invoicesRoutes.get("/orders/:orderId/records", requireAuth, async (req, res) => {
  const order = await prismaStore.getOrder(req.params.orderId);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }
  if (!canAccessOrder(order, req.auth.user)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const records = await prismaStore.listInvoiceRecordsByOrderGroup(order.id);
  return res.json({ items: records, orderId: order.id });
});

invoicesRoutes.get("/records", requireAuth, async (req, res) => {
  const result = await prismaStore.listInvoiceRecordsPage({
    page: req.query.page,
    pageSize: req.query.pageSize,
    search: req.query.search,
    state: req.query.state,
    creatorId: req.auth.user.role === "ADMIN" ? undefined : req.auth.user.id
  });
  return res.json({ items: result.items, data: result.items, meta: result.meta });
});

invoicesRoutes.post("/batch-issue", requireAuth, async (req, res) => {
  const itemIds = Array.isArray(req.body?.itemIds)
    ? req.body.itemIds.map((it) => String(it)).filter(Boolean)
    : [];
  const templateId = String(req.body?.templateId || "").trim();
  const emailInput = String(req.body?.email || "").trim();

  if (itemIds.length === 0) {
    return res.status(400).json({ message: "itemIds is required" });
  }
  if (!templateId) {
    return res.status(400).json({ message: "templateId is required" });
  }

  const template = await prismaStore.getInvoiceTemplateById(templateId);
  if (!template || !template.isEnabled) {
    return res.status(404).json({ message: "Invoice template not found or disabled" });
  }

  const encryptedEmail = await encryptPlainTextForAtour({ text: emailInput || template.email || "" }).catch(() => "");
  if (!encryptedEmail) {
    return res.status(400).json({ message: "email is required (plain text or enc(...))" });
  }

  const results = [];
  for (const itemId of itemIds) {
    const item = await prismaStore.getOrderItemById(itemId);
    if (!item) {
      results.push({ itemId, ok: false, message: "order item not found" });
      continue;
    }
    const order = await prismaStore.getOrder(item.groupId);
    if (!order || !canAccessOrder(order, req.auth.user)) {
      results.push({ itemId, ok: false, message: "forbidden" });
      continue;
    }
    if (item.status !== "COMPLETED") {
      results.push({ itemId, ok: false, message: "仅已离店(已完成)拆单支持开票" });
      continue;
    }
    if (!item.atourOrderId) {
      results.push({ itemId, ok: false, message: "拆单缺少亚朵订单号，无法开票" });
      continue;
    }
    if (item.invoice?.state === "ISSUED") {
      results.push({ itemId, ok: false, message: "该拆单已开票" });
      continue;
    }

    if (!item.accountId) {
      results.push({ itemId, ok: false, message: "拆单未绑定下单账号，无法开票" });
      continue;
    }
    const credential = await prismaStore.getPoolAccountCredential(item.accountId);
    const boundToken = String(credential?.token || "").trim();
    if (!boundToken) {
      results.push({ itemId, ok: false, message: "拆单绑定账号token缺失，无法开票" });
      continue;
    }
    const proxy = await prismaStore.acquireProxyNode();
    if (!proxy) {
      results.push({ itemId, ok: false, message: "暂无可用代理" });
      continue;
    }

    try {
      const issuePayload = {
        orderId: item.atourOrderId,
        chainId: order.chainId,
        invoiceId: template.invoiceId,
        invoiceType: template.invoiceType,
        invoiceTitleType: template.invoiceTitleType,
        invoiceName: template.invoiceName,
        email: encryptedEmail,
        orderAmount: String(item.amount)
      };

      if (item.invoice) {
        await prismaStore.updateInvoiceRecordByOrderItemId(item.id, {
          invoiceTemplateId: template.id,
          invoiceId: template.invoiceId,
          orderId: item.atourOrderId,
          chainId: order.chainId,
          invoiceType: template.invoiceType,
          invoiceTitleType: template.invoiceTitleType,
          invoiceName: template.invoiceName,
          taxNo: template.taxNo,
          email: encryptedEmail,
          state: "PENDING",
          stateDesc: "开票中",
          submittedPayload: issuePayload,
          responsePayload: null,
          errorMessage: null,
          issuedAt: null,
          createdBy: req.auth.user.id
        });
      } else {
        await prismaStore.createInvoiceRecord({
          orderItemId: item.id,
          orderGroupId: order.id,
          invoiceTemplateId: template.id,
          invoiceId: template.invoiceId,
          orderId: item.atourOrderId,
          chainId: order.chainId,
          invoiceType: template.invoiceType,
          invoiceTitleType: template.invoiceTitleType,
          invoiceName: template.invoiceName,
          taxNo: template.taxNo,
          email: encryptedEmail,
          state: "PENDING",
          stateDesc: "开票中",
          submittedPayload: issuePayload,
          createdBy: req.auth.user.id
        });
      }

      const issueResult = await issueEinvoiceV2({
        token: boundToken,
        proxy,
        payload: {
          activeId: "",
          inactiveId: "",
          orderId: String(item.atourOrderId),
          invoiceType: String(template.invoiceType),
          invoicetitle: String(template.invoiceName),
          deviceId: "",
          activitySource: "",
          chainId: String(order.chainId),
          taxpayernumber: String(template.taxNo || ""),
          pmsTaxesAmountParams: [
            {
              amount: String(item.amount),
              taxesCodeName: "住宿费",
              payTaxRate: 0,
              invoiceItemId: 4,
              kpInvoiceItemId: "4",
              actualPayTaxRate: 0.06,
              specialActualPayTaxRate: 0.06,
              taxesCode: "3070402000000000000",
              taxesType: 1,
              selectFlag: true
            }
          ],
          platType: "2",
          appVer: "4.1.0",
          orderAmount: String(item.amount),
          token: String(boundToken),
          email: encryptedEmail,
          mobile: "",
          invoiceId: template.invoiceId,
          remark: ""
        }
      });

      await prismaStore.updateInvoiceRecordByOrderItemId(item.id, {
        state: "ISSUED",
        stateDesc: "已开具",
        issuedAt: new Date().toISOString(),
        responsePayload: issueResult,
        errorMessage: null
      });

      const latestInfo = await getInvoiceInfoByOrder({
        token: boundToken,
        proxy,
        chainId: order.chainId,
        orderId: item.atourOrderId
      }).catch(() => ({ found: false }));

      results.push({ itemId: item.id, ok: true, invoiceId: template.invoiceId, latestInfo });
    } catch (err) {
      await prismaStore.updateInvoiceRecordByOrderItemId(item.id, {
        state: "FAILED",
        stateDesc: "开票失败",
        errorMessage: err?.message || "failed"
      }).catch(() => undefined);
      results.push({ itemId: item.id, ok: false, message: err?.message || "开票失败" });
    }
  }

  return res.json({
    ok: true,
    total: itemIds.length,
    success: results.filter((it) => it.ok).length,
    failed: results.filter((it) => !it.ok).length,
    results
  });
});
