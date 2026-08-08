/**
 * 指向真实用户实体的轻量引用。
 *
 * 用于 ForumNode.managers、ArticleNode.author 等场景，避免把完整 User
 * 重复嵌入多个节点，也避免序列化循环。需要完整资料时通过
 * UserRepository.findByUids() 或 User View 水合。
 */
export interface UserRef {
  readonly uid: string;
  readonly displayName: string;
}
