// 豆包语音合成模型 2.0 (doubao-seed-tts-2.0) 音色目录
// 数据来源：https://www.volcengine.com/docs/6561/1257544
// 字段说明：
//   id        - voice_type，调用 TTS 时作为 speaker 参数
//   name      - 展示名称
//   gender    - "female" | "male"
//   scenario  - 场景分类（用于前端分组展示）
//   style     - 风格简述
//   age       - "child" | "young" | "middle" | "old" | "any"（用于匹配）
//   tags      - 关键词数组（用于 LLM 推荐时的语义匹配）

const VOICES = [
  // ========== 女声 - 通用场景 ==========
  { id: 'zh_female_vv_uranus_bigtts', name: 'Vivi 2.0', gender: 'female', scenario: '通用场景', style: '年轻活力女声', age: 'young', tags: ['通用', '女声', '年轻', '活力', '清澈'] },
  { id: 'zh_female_xiaohe_uranus_bigtts', name: '小何 2.0', gender: 'female', scenario: '通用场景', style: '温柔成熟女声', age: 'middle', tags: ['通用', '女声', '温柔', '成熟', '知性'] },
  { id: 'zh_female_sophie_uranus_bigtts', name: '魅力苏菲 2.0', gender: 'female', scenario: '通用场景', style: '魅力磁性女声', age: 'middle', tags: ['通用', '女声', '魅力', '磁性', '成熟'] },
  { id: 'zh_female_qingxinnvsheng_uranus_bigtts', name: '清新女声 2.0', gender: 'female', scenario: '通用场景', style: '清新自然女声', age: 'young', tags: ['通用', '女声', '清新', '自然', '年轻'] },
  { id: 'zh_female_tianmeixiaoyuan_uranus_bigtts', name: '甜美小源 2.0', gender: 'female', scenario: '通用场景', style: '甜美清新女声', age: 'young', tags: ['通用', '女声', '甜美', '清新', '少女'] },
  { id: 'zh_female_tianmeitaozi_uranus_bigtts', name: '甜美桃子 2.0', gender: 'female', scenario: '通用场景', style: '柔软甜美女声', age: 'young', tags: ['通用', '女声', '甜美', '柔软', '少女'] },
  { id: 'zh_female_shuangkuaisisi_uranus_bigtts', name: '爽快思思 2.0', gender: 'female', scenario: '通用场景', style: '爽快干练女声', age: 'young', tags: ['通用', '女声', '爽快', '干练', '自信'] },
  { id: 'zh_female_linjianvhai_uranus_bigtts', name: '邻家女孩 2.0', gender: 'female', scenario: '通用场景', style: '亲切邻家女孩', age: 'young', tags: ['通用', '女声', '亲切', '邻家', '少女'] },
  { id: 'zh_female_meilinvyou_uranus_bigtts', name: '魅力女友 2.0', gender: 'female', scenario: '通用场景', style: '魅力亲密女声', age: 'young', tags: ['通用', '女声', '魅力', '亲密', '女友'] },
  { id: 'zh_female_wenroumama_uranus_bigtts', name: '温柔妈妈 2.0', gender: 'female', scenario: '通用场景', style: '温柔慈母女声', age: 'middle', tags: ['通用', '女声', '温柔', '慈母', '成熟'] },
  { id: 'zh_female_qiaopinv_uranus_bigtts', name: '俏皮女声 2.0', gender: 'female', scenario: '通用场景', style: '俏皮可爱女声', age: 'young', tags: ['通用', '女声', '俏皮', '可爱', '少女'] },
  { id: 'zh_female_mengyatou_uranus_bigtts', name: '萌丫头 2.0', gender: 'female', scenario: '通用场景', style: '萌系丫头女声', age: 'young', tags: ['通用', '女声', '萌', '可爱', '少女'] },
  { id: 'zh_female_tiexinnvsheng_uranus_bigtts', name: '贴心女声 2.0', gender: 'female', scenario: '通用场景', style: '贴心温暖女声', age: 'young', tags: ['通用', '女声', '贴心', '温暖'] },
  { id: 'zh_female_kailangjiejie_uranus_bigtts', name: '开朗姐姐 2.0', gender: 'female', scenario: '通用场景', style: '开朗大方姐姐', age: 'young', tags: ['通用', '女声', '开朗', '姐姐', '大方'] },
  { id: 'zh_female_gaolengyujie_uranus_bigtts', name: '高冷御姐 2.0', gender: 'female', scenario: '通用场景', style: '高冷御姐女声', age: 'middle', tags: ['通用', '女声', '高冷', '御姐', '成熟', '强势'] },
  { id: 'zh_female_wenroushunv_uranus_bigtts', name: '温柔淑女 2.0', gender: 'female', scenario: '通用场景', style: '温柔淑女女声', age: 'young', tags: ['通用', '女声', '温柔', '淑女', '优雅'] },
  { id: 'zh_female_zhixingnv_uranus_bigtts', name: '知性女声 2.0', gender: 'female', scenario: '通用场景', style: '知性优雅女声', age: 'middle', tags: ['通用', '女声', '知性', '优雅', '成熟'] },
  { id: 'zh_female_qingchezizi_uranus_bigtts', name: '清澈梓梓 2.0', gender: 'female', scenario: '通用场景', style: '清澈纯净女声', age: 'young', tags: ['通用', '女声', '清澈', '纯净'] },
  { id: 'zh_female_tianmeiyueyue_uranus_bigtts', name: '甜美悦悦 2.0', gender: 'female', scenario: '通用场景', style: '甜美悦耳女声', age: 'young', tags: ['通用', '女声', '甜美', '悦耳'] },
  { id: 'zh_female_roumeinvyou_uranus_bigtts', name: '柔美女友 2.0', gender: 'female', scenario: '通用场景', style: '柔美亲密女声', age: 'young', tags: ['通用', '女声', '柔美', '亲密'] },
  { id: 'zh_female_wenrouxiaoya_uranus_bigtts', name: '温柔小雅 2.0', gender: 'female', scenario: '通用场景', style: '温柔文雅女声', age: 'young', tags: ['通用', '女声', '温柔', '文雅'] },
  { id: 'zh_female_qinqienv_uranus_bigtts', name: '亲切女声 2.0', gender: 'female', scenario: '通用场景', style: '亲切和蔼女声', age: 'middle', tags: ['通用', '女声', '亲切', '和蔼'] },
  { id: 'zh_female_popo_uranus_bigtts', name: '婆婆 2.0', gender: 'female', scenario: '通用场景', style: '老年女性声音', age: 'old', tags: ['通用', '女声', '老年', '婆婆', '苍老'] },
  { id: 'zh_female_kefunvsheng_uranus_bigtts', name: '暖阳女声 2.0', gender: 'female', scenario: '客服场景', style: '暖阳客服女声', age: 'middle', tags: ['客服', '女声', '温暖', '专业'] },

  // ========== 女声 - 角色扮演 ==========
  { id: 'zh_female_cancan_uranus_bigtts', name: '知性灿灿 2.0', gender: 'female', scenario: '角色扮演', style: '知性干练女声', age: 'middle', tags: ['角色', '女声', '知性', '干练', '成熟'] },
  { id: 'zh_female_sajiaoxuemei_uranus_bigtts', name: '撒娇学妹 2.0', gender: 'female', scenario: '角色扮演', style: '撒娇可爱学妹', age: 'young', tags: ['角色', '女声', '撒娇', '可爱', '学妹', '少女'] },
  { id: 'zh_female_zhishuaiyingzi_uranus_bigtts', name: '直率英子 2.0', gender: 'female', scenario: '角色扮演', style: '直率爽朗女声', age: 'middle', tags: ['角色', '女声', '直率', '爽朗', '北方'] },
  { id: 'zh_female_yingtaowanzi_uranus_bigtts', name: '樱桃丸子 2.0', gender: 'female', scenario: '角色扮演', style: '童趣小女孩', age: 'child', tags: ['角色', '女声', '童趣', '小女孩', '可爱'] },
  { id: 'zh_female_gufengshaoyu_uranus_bigtts', name: '古风少御 2.0', gender: 'female', scenario: '角色扮演', style: '古风少御女声', age: 'middle', tags: ['角色', '女声', '古风', '少御', '古典'] },
  { id: 'zh_female_linxiao_uranus_bigtts', name: '林潇 2.0', gender: 'female', scenario: '角色扮演', style: '清冷少女女声', age: 'young', tags: ['角色', '女声', '清冷', '少女'] },
  { id: 'zh_female_lingling_uranus_bigtts', name: '玲玲姐姐 2.0', gender: 'female', scenario: '角色扮演', style: '亲切姐姐女声', age: 'young', tags: ['角色', '女声', '亲切', '姐姐'] },
  { id: 'zh_female_nvleishen_uranus_bigtts', name: '女雷神 2.0', gender: 'female', scenario: '角色扮演', style: '威严霸气女声', age: 'middle', tags: ['角色', '女声', '威严', '霸气', '强势'] },
  { id: 'zh_female_wuzetian_uranus_bigtts', name: '武则天 2.0', gender: 'female', scenario: '角色扮演', style: '威严女皇女声', age: 'middle', tags: ['角色', '女声', '威严', '女皇', '霸气', '古典'] },
  { id: 'zh_female_gujie_uranus_bigtts', name: '顾姐 2.0', gender: 'female', scenario: '角色扮演', style: '飒爽御姐女声', age: 'middle', tags: ['角色', '女声', '飒爽', '御姐', '成熟'] },

  // ========== 女声 - 视频配音 / 有声阅读 ==========
  { id: 'zh_female_peiqi_uranus_bigtts', name: '佩奇猪 2.0', gender: 'female', scenario: '视频配音', style: '童真小女孩', age: 'child', tags: ['配音', '女声', '童真', '小女孩', '可爱'] },
  { id: 'zh_female_mizai_uranus_bigtts', name: '黑猫侦探社咪仔 2.0', gender: 'female', scenario: '视频配音', style: '俏皮少女女声', age: 'young', tags: ['配音', '女声', '俏皮', '少女'] },
  { id: 'zh_female_jitangnv_uranus_bigtts', name: '鸡汤女 2.0', gender: 'female', scenario: '视频配音', style: '抒情治愈女声', age: 'middle', tags: ['配音', '女声', '抒情', '治愈', '成熟'] },
  { id: 'zh_female_liuchangnv_uranus_bigtts', name: '流畅女声 2.0', gender: 'female', scenario: '视频配音', style: '流畅清晰女声', age: 'middle', tags: ['配音', '女声', '流畅', '清晰', '专业'] },
  { id: 'zh_female_tvbnv_uranus_bigtts', name: 'TVB女声 2.0', gender: 'female', scenario: '视频配音', style: 'TVB港风女声', age: 'middle', tags: ['配音', '女声', 'TVB', '港风', '粤语'] },
  { id: 'zh_female_xiaoxue_uranus_bigtts', name: '儿童绘本 2.0', gender: 'female', scenario: '有声阅读', style: '纯净童声女声', age: 'child', tags: ['有声书', '女声', '童声', '纯净', '绘本'] },
  { id: 'zh_female_shaoergushi_uranus_bigtts', name: '少儿故事 2.0', gender: 'female', scenario: '有声阅读', style: '亲和讲故事女声', age: 'middle', tags: ['有声书', '女声', '亲和', '故事', '少儿'] },

  // ========== 男声 - 通用场景 ==========
  { id: 'zh_male_m191_uranus_bigtts', name: '云舟 2.0', gender: 'male', scenario: '通用场景', style: '沉稳磁性男声', age: 'middle', tags: ['通用', '男声', '沉稳', '磁性', '成熟'] },
  { id: 'zh_male_taocheng_uranus_bigtts', name: '小天 2.0', gender: 'male', scenario: '通用场景', style: '活力阳光男声', age: 'young', tags: ['通用', '男声', '活力', '阳光', '年轻'] },
  { id: 'zh_male_liufei_uranus_bigtts', name: '刘飞 2.0', gender: 'male', scenario: '通用场景', style: '低沉温暖男声', age: 'middle', tags: ['通用', '男声', '低沉', '温暖', '成熟'] },
  { id: 'zh_male_shaonianzixin_uranus_bigtts', name: '少年梓辛 2.0', gender: 'male', scenario: '通用场景', style: '清亮少年男声', age: 'young', tags: ['通用', '男声', '少年', '清亮', '年轻'] },
  { id: 'zh_male_linjiananhai_uranus_bigtts', name: '邻家男孩 2.0', gender: 'male', scenario: '通用场景', style: '亲切邻家男孩', age: 'young', tags: ['通用', '男声', '亲切', '邻家', '年轻'] },
  { id: 'zh_male_ruyaqingnian_uranus_bigtts', name: '儒雅青年 2.0', gender: 'male', scenario: '通用场景', style: '儒雅文质男声', age: 'young', tags: ['通用', '男声', '儒雅', '文质', '年轻', '旁白'] },
  { id: 'zh_male_wennuanahu_uranus_bigtts', name: '温暖阿虎 2.0', gender: 'male', scenario: '通用场景', style: '温暖宽厚男声', age: 'middle', tags: ['通用', '男声', '温暖', '宽厚', '成熟'] },
  { id: 'zh_male_naiqimengwa_uranus_bigtts', name: '奶气萌娃 2.0', gender: 'male', scenario: '通用场景', style: '奶气小男孩', age: 'child', tags: ['通用', '男声', '奶气', '小男孩', '童声'] },
  { id: 'zh_male_aojiaobazong_uranus_bigtts', name: '傲娇霸总 2.0', gender: 'male', scenario: '通用场景', style: '傲娇霸道男声', age: 'middle', tags: ['通用', '男声', '傲娇', '霸道', '强势', '总裁'] },
  { id: 'zh_male_fanjuanqingnian_uranus_bigtts', name: '反卷青年 2.0', gender: 'male', scenario: '通用场景', style: '松弛青年男声', age: 'young', tags: ['通用', '男声', '松弛', '青年', '随性'] },
  { id: 'zh_male_huolixiaoge_uranus_bigtts', name: '活力小哥 2.0', gender: 'male', scenario: '通用场景', style: '活力爽朗小哥', age: 'young', tags: ['通用', '男声', '活力', '爽朗', '小哥'] },
  { id: 'zh_male_jieshuoxiaoming_uranus_bigtts', name: '解说小明 2.0', gender: 'male', scenario: '通用场景', style: '解说清晰男声', age: 'middle', tags: ['通用', '男声', '解说', '清晰', '旁白'] },
  { id: 'zh_male_yizhipiannan_uranus_bigtts', name: '译制片男 2.0', gender: 'male', scenario: '通用场景', style: '译制片配音男声', age: 'middle', tags: ['通用', '男声', '译制', '配音', '旁白', '成熟'] },
  { id: 'zh_male_gaolengchenwen_uranus_bigtts', name: '高冷沉稳 2.0', gender: 'male', scenario: '通用场景', style: '高冷沉稳男声', age: 'middle', tags: ['通用', '男声', '高冷', '沉稳', '成熟', '强势'] },
  { id: 'zh_male_shenyeboke_uranus_bigtts', name: '深夜播客 2.0', gender: 'male', scenario: '通用场景', style: '深夜低沉男声', age: 'middle', tags: ['通用', '男声', '深夜', '低沉', '磁性', '成熟'] },
  { id: 'zh_male_yuanboxiaoshu_uranus_bigtts', name: '渊博小叔 2.0', gender: 'male', scenario: '通用场景', style: '渊博儒雅男声', age: 'middle', tags: ['通用', '男声', '渊博', '儒雅', '成熟', '旁白'] },
  { id: 'zh_male_yangguangqingnian_uranus_bigtts', name: '阳光青年 2.0', gender: 'male', scenario: '通用场景', style: '阳光开朗青年', age: 'young', tags: ['通用', '男声', '阳光', '开朗', '年轻'] },
  { id: 'zh_male_wenrouxiaoge_uranus_bigtts', name: '温柔小哥 2.0', gender: 'male', scenario: '通用场景', style: '温柔细腻男声', age: 'young', tags: ['通用', '男声', '温柔', '细腻', '年轻'] },
  { id: 'zh_male_dongfanghaoran_uranus_bigtts', name: '东方浩然 2.0', gender: 'male', scenario: '通用场景', style: '浩然正气男声', age: 'middle', tags: ['通用', '男声', '正气', '浩然', '成熟'] },
  { id: 'zh_male_tiancaitongsheng_uranus_bigtts', name: '天才童声 2.0', gender: 'male', scenario: '通用场景', style: '机灵小男孩', age: 'child', tags: ['通用', '男声', '机灵', '小男孩', '童声'] },
  { id: 'zh_male_kailangdidi_uranus_bigtts', name: '开朗弟弟 2.0', gender: 'male', scenario: '通用场景', style: '开朗少年男声', age: 'young', tags: ['通用', '男声', '开朗', '弟弟', '少年'] },
  { id: 'zh_male_kailangxuezhang_uranus_bigtts', name: '开朗学长 2.0', gender: 'male', scenario: '通用场景', style: '开朗学长男声', age: 'young', tags: ['通用', '男声', '开朗', '学长', '青年'] },
  { id: 'zh_male_youyoujunzi_uranus_bigtts', name: '悠悠君子 2.0', gender: 'male', scenario: '通用场景', style: '温润君子男声', age: 'middle', tags: ['通用', '男声', '温润', '君子', '古典'] },
  { id: 'zh_male_qingshuangnanda_uranus_bigtts', name: '清爽男大 2.0', gender: 'male', scenario: '通用场景', style: '清爽大学生男声', age: 'young', tags: ['通用', '男声', '清爽', '大学生', '年轻'] },
  { id: 'zh_male_cixingjieshuonan_uranus_bigtts', name: '磁性解说男声 2.0', gender: 'male', scenario: '通用场景', style: '磁性解说男声', age: 'middle', tags: ['通用', '男声', '磁性', '解说', '旁白'] },
  { id: 'zh_male_liangsangmengzai_uranus_bigtts', name: '亮嗓萌仔 2.0', gender: 'male', scenario: '通用场景', style: '亮嗓小男孩', age: 'child', tags: ['通用', '男声', '亮嗓', '小男孩', '童声'] },

  // ========== 男声 - 角色扮演 ==========
  { id: 'zh_male_sunwukong_uranus_bigtts', name: '猴哥 2.0', gender: 'male', scenario: '角色扮演', style: '孙悟空特色声', age: 'any', tags: ['角色', '男声', '孙悟空', '猴哥', '特色'] },
  { id: 'zh_male_silang_uranus_bigtts', name: '四郎 2.0', gender: 'male', scenario: '角色扮演', style: '俊朗少男声', age: 'young', tags: ['角色', '男声', '俊朗', '少男', '古风'] },
  { id: 'zh_male_qingcang_uranus_bigtts', name: '擎苍 2.0', gender: 'male', scenario: '角色扮演', style: '霸气冷峻男声', age: 'middle', tags: ['角色', '男声', '霸气', '冷峻', '强势', '古风'] },
  { id: 'zh_male_xionger_uranus_bigtts', name: '熊二 2.0', gender: 'male', scenario: '角色扮演', style: '憨厚熊二声', age: 'any', tags: ['角色', '男声', '憨厚', '熊二', '特色'] },
  { id: 'zh_male_tangseng_uranus_bigtts', name: '唐僧 2.0', gender: 'male', scenario: '角色扮演', style: '唐僧慈悲男声', age: 'middle', tags: ['角色', '男声', '唐僧', '慈悲', '古典'] },
  { id: 'zh_male_zhuangzhou_uranus_bigtts', name: '庄周 2.0', gender: 'male', scenario: '角色扮演', style: '逍遥哲人男声', age: 'middle', tags: ['角色', '男声', '逍遥', '哲人', '古典'] },
  { id: 'zh_male_zhubajie_uranus_bigtts', name: '猪八戒 2.0', gender: 'male', scenario: '角色扮演', style: '猪八戒特色声', age: 'any', tags: ['角色', '男声', '猪八戒', '特色', '憨厚'] },
  { id: 'zh_male_lubanqihao_uranus_bigtts', name: '鲁班七号 2.0', gender: 'male', scenario: '角色扮演', style: '机灵少年声', age: 'child', tags: ['角色', '男声', '机灵', '少年', '特色'] },
  { id: 'zh_male_lanyinmianbao_uranus_bigtts', name: '懒音绵宝 2.0', gender: 'male', scenario: '角色扮演', style: '慵懒少年男声', age: 'young', tags: ['角色', '男声', '慵懒', '少年', '随性'] },

  // ========== 男声 - 视频配音 / 有声阅读 ==========
  { id: 'zh_male_dayi_uranus_bigtts', name: '大壹 2.0', gender: 'male', scenario: '视频配音', style: '沉稳磁性男声', age: 'middle', tags: ['配音', '男声', '沉稳', '磁性', '旁白'] },
  { id: 'zh_male_ruyayichen_uranus_bigtts', name: '儒雅逸辰 2.0', gender: 'male', scenario: '视频配音', style: '儒雅温润男声', age: 'young', tags: ['配音', '男声', '儒雅', '温润', '年轻', '旁白'] },
  { id: 'zh_male_guanggaojieshuo_uranus_bigtts', name: '广告解说 2.0', gender: 'male', scenario: '视频配音', style: '广告磁性解说', age: 'middle', tags: ['配音', '男声', '广告', '解说', '磁性', '旁白'] },
  { id: 'zh_male_baqiqingshu_uranus_bigtts', name: '霸气青叔 2.0', gender: 'male', scenario: '有声阅读', style: '霸气沉稳青叔', age: 'middle', tags: ['有声书', '男声', '霸气', '沉稳', '青叔', '旁白'] },
  { id: 'zh_male_xuanyijieshuo_uranus_bigtts', name: '悬疑解说 2.0', gender: 'male', scenario: '有声阅读', style: '悬疑低沉解说', age: 'middle', tags: ['有声书', '男声', '悬疑', '低沉', '解说', '旁白'] },
];

// 按场景分组（前端展示用）
function groupedByScenario() {
  const groups = {};
  for (const v of VOICES) {
    if (!groups[v.scenario]) groups[v.scenario] = [];
    groups[v.scenario].push(v);
  }
  return groups;
}

// 按 id 索引
const VOICE_MAP = VOICES.reduce((acc, v) => {
  acc[v.id] = v;
  return acc;
}, {});

function findById(id) {
  return VOICE_MAP[id] || null;
}

function findByGender(gender) {
  return VOICES.filter((v) => v.gender === gender);
}

// 默认旁白音色
const DEFAULT_NARRATION_VOICE = 'zh_male_yizhipiannan_uranus_bigtts';

module.exports = {
  VOICES,
  groupedByScenario,
  findById,
  findByGender,
  DEFAULT_NARRATION_VOICE,
};
