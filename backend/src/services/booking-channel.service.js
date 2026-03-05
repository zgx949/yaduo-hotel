const UNLIMITED = -1;

const asArray = (value) => (Array.isArray(value) ? value : []);

const hasQuota = (value) => Number(value) === UNLIMITED || Number(value) > 0;

const normalizeTier = (value) => String(value || "NORMAL").toUpperCase();

export const parseBookingTier = (rawTier) => {
  const tier = String(rawTier || "NORMAL").trim();
  if (!tier) {
    return { tier: "NORMAL", corporateName: null, channelKey: "NORMAL" };
  }

  const [head, ...rest] = tier.split(":");
  const normalizedHead = normalizeTier(head);
  const corporateName = rest.join(":").trim() || null;

  if (normalizedHead === "CORPORATE") {
    return {
      tier: "CORPORATE",
      corporateName,
      channelKey: corporateName ? `CORPORATE:${corporateName}` : "CORPORATE"
    };
  }

  if (["NEW_USER", "PLATINUM", "NORMAL"].includes(normalizedHead)) {
    return { tier: normalizedHead, corporateName: null, channelKey: normalizedHead };
  }

  return { tier: "NORMAL", corporateName: null, channelKey: "NORMAL" };
};

export const canUserUseBookingTier = ({ user, channel, systemChannels }) => {
  if (!user) {
    return { ok: false, message: "user not found" };
  }

  if (user.role === "ADMIN") {
    return { ok: true };
  }

  const permissions = user.permissions || {};
  const tier = channel?.tier || "NORMAL";

  if (tier === "NEW_USER") {
    if (!systemChannels?.enableNewUser) {
      return { ok: false, message: "新客渠道已全局关闭" };
    }
    if (!permissions.allowNewUserBooking) {
      return { ok: false, message: "无新客下单权限" };
    }
    if (!hasQuota(permissions.newUserQuota) || !hasQuota(permissions.newUserLimit)) {
      return { ok: false, message: "新客配额不足" };
    }
    return { ok: true };
  }

  if (tier === "PLATINUM") {
    if (!systemChannels?.enablePlatinum) {
      return { ok: false, message: "铂金渠道已全局关闭" };
    }
    if (!permissions.allowPlatinumBooking) {
      return { ok: false, message: "无铂金下单权限" };
    }
    if (!hasQuota(permissions.platinumQuota) || !hasQuota(permissions.platinumLimit)) {
      return { ok: false, message: "铂金配额不足" };
    }
    return { ok: true };
  }

  if (tier === "CORPORATE") {
    if (!systemChannels?.enableCorporate) {
      return { ok: false, message: "企业协议渠道已全局关闭" };
    }
    if (!permissions.allowCorporateBooking) {
      return { ok: false, message: "无企业协议下单权限" };
    }
    if (!hasQuota(permissions.corporateQuota) || !hasQuota(permissions.corporateLimit)) {
      return { ok: false, message: "企业协议配额不足" };
    }

    const blockedNames = new Set(asArray(systemChannels?.disabledCorporateNames).map((it) => String(it)));
    if (channel.corporateName && blockedNames.has(channel.corporateName)) {
      return { ok: false, message: `企业协议 ${channel.corporateName} 已全局关闭` };
    }

    const allowedNames = asArray(permissions.allowedCorporateNames).map((it) => String(it));
    if (allowedNames.length > 0 && channel.corporateName && !allowedNames.includes(channel.corporateName)) {
      return { ok: false, message: `无企业协议 ${channel.corporateName} 使用权限` };
    }

    if (channel.corporateName) {
      const specificQuota = Number((permissions.corporateSpecificQuotas || {})[channel.corporateName]);
      const specificLimit = Number((permissions.corporateSpecificLimits || {})[channel.corporateName]);
      if (!Number.isNaN(specificQuota) && !hasQuota(specificQuota)) {
        return { ok: false, message: `企业协议 ${channel.corporateName} 配额不足` };
      }
      if (!Number.isNaN(specificLimit) && !hasQuota(specificLimit)) {
        return { ok: false, message: `企业协议 ${channel.corporateName} 当日额度不足` };
      }
    }
    return { ok: true };
  }

  return { ok: true };
};

export const buildSearchChannelsForUser = ({ user, systemChannels, poolAccounts }) => {
  const channels = [];
  const accounts = asArray(poolAccounts);

  const onlineNewUser = accounts.some((it) => it.is_online && it.is_enabled !== false && it.is_new_user);
  const onlinePlatinum = accounts.some((it) => it.is_online && it.is_enabled !== false && it.is_platinum);
  const onlineCorporateNames = Array.from(
    new Set(
      accounts
        .filter((it) => it.is_online && it.is_enabled !== false)
        .flatMap((it) => asArray(it.corporate_agreements))
        .filter((it) => it?.enabled)
        .map((it) => String(it.name || "").trim())
        .filter(Boolean)
    )
  );

  const addChannel = (channel) => {
    const allowed = canUserUseBookingTier({ user, channel, systemChannels });
    if (allowed.ok) {
      channels.push(channel);
    }
  };

  if (onlineNewUser) {
    addChannel({ tier: "NEW_USER", channelKey: "NEW_USER", label: "新客" });
  }

  if (onlinePlatinum) {
    addChannel({ tier: "PLATINUM", channelKey: "PLATINUM", label: "铂金" });
  }

  if (onlineCorporateNames.length > 0) {
    const blocked = new Set(asArray(systemChannels?.disabledCorporateNames).map((it) => String(it)));
    const allowedBySystem = onlineCorporateNames.filter((name) => !blocked.has(name));

    if (user?.role === "ADMIN") {
      allowedBySystem.forEach((corpName) => {
        addChannel({
          tier: "CORPORATE",
          corporateName: corpName,
          channelKey: `CORPORATE:${corpName}`,
          label: `企业:${corpName}`
        });
      });
    } else {
      const permissionNames = asArray(user?.permissions?.allowedCorporateNames).map((it) => String(it));
      const targetNames = permissionNames.length > 0
        ? allowedBySystem.filter((name) => permissionNames.includes(name))
        : allowedBySystem;

      if (targetNames.length === 0) {
        addChannel({ tier: "CORPORATE", channelKey: "CORPORATE", label: "企业(全部)" });
      } else {
        targetNames.forEach((corpName) => {
          addChannel({
            tier: "CORPORATE",
            corporateName: corpName,
            channelKey: `CORPORATE:${corpName}`,
            label: `企业:${corpName}`
          });
        });
      }
    }
  }

  return channels;
};
