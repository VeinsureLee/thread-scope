/**
 * MCP 用户输出安全投影。
 * 持久化层可以按现有业务需要保存字段；对外响应默认不返回联系方式和访问地址。
 */
export function publicUserProfile(profile: Record<string, unknown>): Record<string, unknown> {
  const {
    qq: _qq,
    msn: _msn,
    lastIp: _lastIp,
    homepage: _homepage,
    ...safe
  } = profile;
  return safe;
}

export function presentGetUser(result: {
  uid: string;
  profile: Record<string, unknown>;
  titles: readonly string[];
  persisted: boolean;
}): { text: string; data: Record<string, unknown> } {
  return {
    text: [
      `用户: ${result.uid}`,
      "资料: 已获取",
      `特殊头衔: ${result.titles.length > 0 ? result.titles.join(" / ") : "无"}`,
      `落库: ${result.persisted ? "是" : "否"}`,
    ].join("\n"),
    data: publicUserProfile(result.profile),
  };
}
