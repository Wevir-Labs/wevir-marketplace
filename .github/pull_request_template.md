<!-- 中文、English 都可以。 -->

**Entry / 条目:** `plugins/<id>` or `skills/<name>`

**What it does / 用途:**

**Connects to / 连接到:** <!-- services, hosts or "nothing" / 访问的服务与地址，或“无” -->

**Tested in Wevir / 在 Wevir 中的测试:** <!-- what you tried and what happened / 试了什么、结果如何 -->

**Author checklist / 作者自查**

- [ ] `node scripts/validate.mjs --base upstream/main` passes / 校验通过
- [ ] Only my entry's directory changed / 只改了自己条目的目录
- [ ] `version` raised for an update / 更新时提高了 `version`
- [ ] README lists every service it contacts, the keys it needs and what must be installed / README 写明访问的服务、需要的密钥与依赖

**Review checklist / 审核清单** (maintainers)

- [ ] Commands and URLs match the README; nothing downloads code at install time
- [ ] Package versions are pinned and the packages are the ones the author maintains
- [ ] No secrets, telemetry or unexpected network access in the files
- [ ] Inputs ask only for what the server needs; secrets are marked `secret`
- [ ] License allows redistribution
- [ ] Sync pull requests (`upstream-sync`): the upstream diff and every `risk:*` label checked
