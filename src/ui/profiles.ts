/** 随机昵称生成:全部不超过 4 个汉字,每局随机抽取 4 个不重复的。 */
const NAME_POOL = [
  "风清扬", "夜未央", "墨白", "苏浅", "顾北辰", "林晚", "云归处", "白衣渡",
  "青衫客", "燕归巢", "星河", "陆离", "沈眠", "江晚吟", "温言", "秦楼月",
  "楚歌", "洛尘", "叶知秋", "南栀", "沈砚", "谢栖迟", "阿澈", "周野",
] as const;

export interface PlayerProfile { seat: 0 | 1 | 2 | 3; name: string; avatar: string; }

const AVATARS = [0, 1, 2, 3].map((index) => `${import.meta.env.BASE_URL}avatars/p${index}.png`);

/** 洗牌抽取 4 个不重复昵称,头像固定按座位分配(每局一致)。 */
export function randomProfiles(): PlayerProfile[] {
  const pool = [...NAME_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return ([0, 1, 2, 3] as const).map((seat) => ({ seat, name: pool[seat]!, avatar: AVATARS[seat]! }));
}
