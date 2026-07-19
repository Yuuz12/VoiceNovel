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

// ========== 小米 MIMO 预置精品音色（mimo-v2.5-tts）==========
// 数据来源：https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5
// 字段含义同火山音色；id 即音色名（调用时作为 audio.voice）
const MIMO_VOICES = [
  // 中文
  { id: '冰糖', name: '冰糖', gender: 'female', scenario: '中文音色', style: '活泼少女', age: 'young', tags: ['中文', '女声', '活泼', '少女', 'MIMO'] },
  { id: '茉莉', name: '茉莉', gender: 'female', scenario: '中文音色', style: '知性女声', age: 'middle', tags: ['中文', '女声', '知性', '成熟', 'MIMO'] },
  { id: '苏打', name: '苏打', gender: 'male', scenario: '中文音色', style: '阳光少年', age: 'young', tags: ['中文', '男声', '阳光', '少年', 'MIMO'] },
  { id: '白桦', name: '白桦', gender: 'male', scenario: '中文音色', style: '成熟男声', age: 'middle', tags: ['中文', '男声', '成熟', '磁性', 'MIMO'] },
  // English
  { id: 'Mia', name: 'Mia', gender: 'female', scenario: 'English Voices', style: 'Lively girl', age: 'young', tags: ['English', 'Female', 'Lively', 'MIMO'] },
  { id: 'Chloe', name: 'Chloe', gender: 'female', scenario: 'English Voices', style: 'Sweet Dreamy', age: 'young', tags: ['English', 'Female', 'Sweet', 'MIMO'] },
  { id: 'Milo', name: 'Milo', gender: 'male', scenario: 'English Voices', style: 'Sunny boy', age: 'young', tags: ['English', 'Male', 'Sunny', 'MIMO'] },
  { id: 'Dean', name: 'Dean', gender: 'male', scenario: 'English Voices', style: 'Steady Gentle', age: 'middle', tags: ['English', 'Male', 'Steady', 'MIMO'] },
];

// ========== OpenAI TTS 预制音色 ==========
// 文档：https://platform.openai.com/docs/guides/text-to-speech
// 共 13 个固定音色，不支持 voice clone
// tts-1/tts-1-hd 仅支持前 9 个；gpt-4o-mini-tts 支持全部 13 个
const OPENAI_VOICES = [
  // 原始 6 个（所有模型通用）
  { id: 'alloy', name: 'Alloy', gender: 'any', scenario: '通用音色', style: '中性平衡', age: 'any', tags: ['OpenAI', '中性', '通用'] },
  { id: 'echo', name: 'Echo', gender: 'male', scenario: '通用音色', style: '温和男声', age: 'middle', tags: ['OpenAI', '男声', '温和'] },
  { id: 'fable', name: 'Fable', gender: 'any', scenario: '通用音色', style: '叙事故事感', age: 'any', tags: ['OpenAI', '叙事', '故事'] },
  { id: 'onyx', name: 'Onyx', gender: 'male', scenario: '通用音色', style: '深沉磁性男声', age: 'middle', tags: ['OpenAI', '男声', '深沉', '磁性'] },
  { id: 'nova', name: 'Nova', gender: 'female', scenario: '通用音色', style: '清晰活力女声', age: 'young', tags: ['OpenAI', '女声', '清晰', '活力'] },
  { id: 'shimmer', name: 'Shimmer', gender: 'female', scenario: '通用音色', style: '温暖柔和女声', age: 'young', tags: ['OpenAI', '女声', '温暖', '柔和'] },
  // 2024-10 新增
  { id: 'ash', name: 'Ash', gender: 'male', scenario: '通用音色', style: '轻松随性男声', age: 'young', tags: ['OpenAI', '男声', '轻松', '随性'] },
  { id: 'coral', name: 'Coral', gender: 'female', scenario: '通用音色', style: '明快活泼女声', age: 'young', tags: ['OpenAI', '女声', '明快', '活泼'] },
  { id: 'sage', name: 'Sage', gender: 'any', scenario: '通用音色', style: '沉稳睿智', age: 'middle', tags: ['OpenAI', '沉稳', '睿智'] },
  // 仅 gpt-4o-mini-tts 支持
  { id: 'ballad', name: 'Ballad', gender: 'male', scenario: 'gpt-4o-mini-tts 专属', style: '抒情叙事男声', age: 'middle', tags: ['OpenAI', '男声', '抒情', '叙事'] },
  { id: 'verse', name: 'Verse', gender: 'any', scenario: 'gpt-4o-mini-tts 专属', style: '诗意韵律', age: 'any', tags: ['OpenAI', '诗意', '韵律'] },
  { id: 'marin', name: 'Marin', gender: 'female', scenario: 'gpt-4o-mini-tts 专属', style: '海洋般女声', age: 'young', tags: ['OpenAI', '女声', '海洋'] },
  { id: 'cedar', name: 'Cedar', gender: 'male', scenario: 'gpt-4o-mini-tts 专属', style: '木质感温暖男声', age: 'middle', tags: ['OpenAI', '男声', '木质', '温暖'] },
];

// ========== MiniMax TTS 预制音色 ==========
// 文档：https://platform.minimaxi.com/docs/api-reference/speech-t2a-http
// 通过 POST /v1/get_voice 可查询账号下所有音色，此处仅列常用系统音色
// 复刻/设计音色获得的 voice_id 也可直接填入 voiceId 字段使用
const MINIMAX_VOICES = [
  // 中文男声
  { id: 'male-qn-qingse', name: '青涩青年', gender: 'male', scenario: '中文男声', style: '青涩少年', age: 'young', tags: ['MiniMax', '男声', '青涩', '少年'] },
  { id: 'male-qn-jingying', name: '精英青年', gender: 'male', scenario: '中文男声', style: '干练精英', age: 'young', tags: ['MiniMax', '男声', '精英', '干练'] },
  { id: 'male-qn-badao', name: '霸道青年', gender: 'male', scenario: '中文男声', style: '霸道总裁', age: 'middle', tags: ['MiniMax', '男声', '霸道', '总裁'] },
  { id: 'male-qn-daxuesheng', name: '青年大学生', gender: 'male', scenario: '中文男声', style: '大学生', age: 'young', tags: ['MiniMax', '男声', '大学生'] },
  { id: 'presenter_male', name: '主持人男声', gender: 'male', scenario: '中文男声', style: '专业播音', age: 'middle', tags: ['MiniMax', '男声', '播音', '专业'] },
  { id: 'audiobook_male_1', name: '有声书男声1', gender: 'male', scenario: '中文男声', style: '有声书朗读', age: 'middle', tags: ['MiniMax', '男声', '有声书', '旁白'] },
  { id: 'audiobook_male_2', name: '有声书男声2', gender: 'male', scenario: '中文男声', style: '有声书朗读', age: 'middle', tags: ['MiniMax', '男声', '有声书', '旁白'] },
  // 中文女声
  { id: 'female-shaonv', name: '少女', gender: 'female', scenario: '中文女声', style: '清纯少女', age: 'young', tags: ['MiniMax', '女声', '少女', '清纯'] },
  { id: 'female-yujie', name: '御姐', gender: 'female', scenario: '中文女声', style: '成熟御姐', age: 'middle', tags: ['MiniMax', '女声', '御姐', '成熟'] },
  { id: 'female-chengshu', name: '成熟女性', gender: 'female', scenario: '中文女声', style: '知性成熟', age: 'middle', tags: ['MiniMax', '女声', '成熟', '知性'] },
  { id: 'female-tianmei', name: '甜美女性', gender: 'female', scenario: '中文女声', style: '甜美可爱', age: 'young', tags: ['MiniMax', '女声', '甜美', '可爱'] },
  { id: 'presenter_female', name: '主持人女声', gender: 'female', scenario: '中文女声', style: '专业播音', age: 'middle', tags: ['MiniMax', '女声', '播音', '专业'] },
  { id: 'audiobook_female_1', name: '有声书女声1', gender: 'female', scenario: '中文女声', style: '有声书朗读', age: 'middle', tags: ['MiniMax', '女声', '有声书', '旁白'] },
  { id: 'audiobook_female_2', name: '有声书女声2', gender: 'female', scenario: '中文女声', style: '有声书朗读', age: 'middle', tags: ['MiniMax', '女声', '有声书', '旁白'] },
  // 国际化音色
  { id: 'Wise_Woman', name: 'Wise Woman', gender: 'female', scenario: '国际化音色', style: '睿智女性（英）', age: 'middle', tags: ['MiniMax', 'Female', 'English', 'Wise'] },
  { id: 'Friendly_Person', name: 'Friendly Person', gender: 'any', scenario: '国际化音色', style: '友好亲和（英）', age: 'any', tags: ['MiniMax', 'English', 'Friendly'] },
  { id: 'Inspirational_girl', name: 'Inspirational Girl', gender: 'female', scenario: '国际化音色', style: '励志少女（英）', age: 'young', tags: ['MiniMax', 'Female', 'English', 'Inspirational'] },
  { id: 'Deep_Voice_Man', name: 'Deep Voice Man', gender: 'male', scenario: '国际化音色', style: '深沉男声（英）', age: 'middle', tags: ['MiniMax', 'Male', 'English', 'Deep'] },
  { id: 'Calm_Woman', name: 'Calm Woman', gender: 'female', scenario: '国际化音色', style: '平静女声（英）', age: 'middle', tags: ['MiniMax', 'Female', 'English', 'Calm'] },
  { id: 'Casual_Guy', name: 'Casual Guy', gender: 'male', scenario: '国际化音色', style: '随性男声（英）', age: 'young', tags: ['MiniMax', 'Male', 'English', 'Casual'] },
  { id: 'Lively_Girl', name: 'Lively Girl', gender: 'female', scenario: '国际化音色', style: '活泼少女（英）', age: 'young', tags: ['MiniMax', 'Female', 'English', 'Lively'] },
];

// ========== 阿里云百炼 CosyVoice 预制音色 ==========
// 文档：https://help.aliyun.com/zh/model-studio/cosyvoice-voice-list
// 复刻/设计音色获得的 voice_id 也可直接填入 voiceId 字段使用
const BAILIAN_VOICES = [
  // CosyVoice-V3 系列（推荐 cosyvoice-v3-flash 模型）
  { id: 'longanyang', name: '龙安洋', gender: 'male', scenario: 'V3 中文男声', style: '阳光大男孩', age: 'young', tags: ['百炼', '男声', '阳光', 'V3'] },
  { id: 'longanhuan_v3', name: '龙安欢 V3', gender: 'female', scenario: 'V3 中文女声', style: '欢脱元气女（支持9种方言）', age: 'young', tags: ['百炼', '女声', '元气', '方言', 'V3'] },
  { id: 'longhuhu_v3', name: '龙呼呼 V3', gender: 'female', scenario: 'V3 童声', style: '天真烂漫女童', age: 'child', tags: ['百炼', '女声', '童声', 'V3'] },
  { id: 'longpaopao_v3', name: '龙泡泡 V3', gender: 'any', scenario: 'V3 特色', style: '飞天泡泡音', age: 'any', tags: ['百炼', '特色', 'V3'] },
  { id: 'longjielidou_v3', name: '龙杰力豆 V3', gender: 'male', scenario: 'V3 中文男声', style: '阳光顽皮男', age: 'young', tags: ['百炼', '男声', '顽皮', 'V3'] },
  { id: 'longjiaxin_v3', name: '龙嘉欣 V3', gender: 'female', scenario: 'V3 粤语', style: '优雅粤语女', age: 'middle', tags: ['百炼', '女声', '粤语', 'V3'] },
  { id: 'longlaotie_v3', name: '龙老铁 V3', gender: 'male', scenario: 'V3 方言', style: '东北直率男', age: 'middle', tags: ['百炼', '男声', '东北', '方言', 'V3'] },
  { id: 'longshange_v3', name: '龙陕哥 V3', gender: 'male', scenario: 'V3 方言', style: '原味陕北男', age: 'middle', tags: ['百炼', '男声', '陕北', '方言', 'V3'] },
  { id: 'longfei_v3', name: '龙飞 V3', gender: 'male', scenario: 'V3 中文男声', style: '热血磁性男', age: 'middle', tags: ['百炼', '男声', '热血', '磁性', 'V3'] },
  { id: 'longyingxiao_v3', name: '龙应笑 V3', gender: 'female', scenario: 'V3 中文女声', style: '清甜推销女', age: 'young', tags: ['百炼', '女声', '清甜', 'V3'] },
  // 多语种
  { id: 'loongkyong_v3', name: 'Loongkyong', gender: 'female', scenario: 'V3 多语种', style: '韩语女声', age: 'young', tags: ['百炼', '女声', '韩语', 'V3'] },
  { id: 'loongriko_v3', name: 'Loongriko', gender: 'female', scenario: 'V3 多语种', style: '二次元日语女', age: 'young', tags: ['百炼', '女声', '日语', '二次元', 'V3'] },
  { id: 'loongabby_v3', name: 'Loongabby', gender: 'female', scenario: 'V3 多语种', style: '美式英文女', age: 'young', tags: ['百炼', '女声', '美式', '英文', 'V3'] },
  { id: 'loongemily_v3', name: 'Loongemily', gender: 'female', scenario: 'V3 多语种', style: '英式英文女', age: 'middle', tags: ['百炼', '女声', '英式', '英文', 'V3'] },
  // CosyVoice-V2 系列（部分常用）
  { id: 'longxiaochun_v2', name: '龙小淳 V2', gender: 'female', scenario: 'V2 中文女声', style: '温柔姐姐', age: 'young', tags: ['百炼', '女声', '温柔', 'V2'] },
  { id: 'longcheng_v2', name: '龙橙 V2', gender: 'male', scenario: 'V2 中文男声', style: '阳光男声', age: 'young', tags: ['百炼', '男声', '阳光', 'V2'] },
  { id: 'longwan_v2', name: '龙婉 V2', gender: 'female', scenario: 'V2 中文女声', style: '普通话女声', age: 'middle', tags: ['百炼', '女声', '普通话', 'V2'] },
  { id: 'longshu_v2', name: '龙书 V2', gender: 'male', scenario: 'V2 中文男声', style: '新闻男声', age: 'middle', tags: ['百炼', '男声', '新闻', 'V2'] },
];

// 各 provider 默认旁白音色
const DEFAULT_NARRATION_VOICE_BY_PROVIDER = {
  volcano: 'zh_male_yizhipiannan_uranus_bigtts',
  mimo: '白桦',
  openai: 'onyx',
  minimax: 'audiobook_male_1',
  bailian: 'longanyang',
};

// 默认旁白音色（火山，迁移兼容）
const DEFAULT_NARRATION_VOICE = 'zh_male_yizhipiannan_uranus_bigtts';

const VOICES_BY_PROVIDER = {
  volcano: VOICES,
  mimo: MIMO_VOICES,
  openai: OPENAI_VOICES,
  minimax: MINIMAX_VOICES,
  bailian: BAILIAN_VOICES,
};

// 按 provider 取音色列表
function getVoicesByProvider(provider) {
  return VOICES_BY_PROVIDER[provider] || VOICES;
}

// 按 provider 取分组
function groupedByScenarioByProvider(provider) {
  const list = getVoicesByProvider(provider);
  const groups = {};
  for (const v of list) {
    if (!groups[v.scenario]) groups[v.scenario] = [];
    groups[v.scenario].push(v);
  }
  return groups;
}

// 按 provider + id 查找
function findByIdAndProvider(id, provider) {
  return getVoicesByProvider(provider).find((v) => v.id === id) || null;
}

// 按 provider + 性别过滤（多 provider 自动匹配用）
function findByGenderAndProvider(gender, provider) {
  return getVoicesByProvider(provider).filter((v) => v.gender === gender);
}

module.exports = {
  // 既有（火山）导出，保持向后兼容
  VOICES,
  groupedByScenario,
  findById,
  findByGender,
  DEFAULT_NARRATION_VOICE,
  // 新增多 provider 导出
  MIMO_VOICES,
  OPENAI_VOICES,
  MINIMAX_VOICES,
  BAILIAN_VOICES,
  VOICES_BY_PROVIDER,
  DEFAULT_NARRATION_VOICE_BY_PROVIDER,
  getVoicesByProvider,
  groupedByScenarioByProvider,
  findByIdAndProvider,
  findByGenderAndProvider,
};
