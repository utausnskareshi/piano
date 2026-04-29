// 50 built-in songs, all public-domain or user's-original arrangements.
// Each `notation` string follows the parser format defined in src/data/parser.ts.
// The arrangements are simplified single-line melodies playable in 3-octave range
// (C- to B+), suitable for learning and auto modes.

export interface BuiltInSong {
  id: string;
  title: string;
  composer?: string;
  category: '童謡・伝承' | 'クラシック' | 'クリスマス・賛美歌';
  notation: string;
}

export const BUILT_IN_SONGS: BuiltInSong[] = [
  // ===== 童謡・伝承 (20) =====
  {
    id: 'twinkle',
    title: 'きらきら星',
    category: '童謡・伝承',
    notation: 'C C G G A A G~ F F E E D D C~ G G F F E E D~ G G F F E E D~ C C G G A A G~ F F E E D D C~'
  },
  {
    id: 'mary',
    title: 'メリーさんのひつじ',
    category: '童謡・伝承',
    notation: 'E D C D E E E~ D D D~ E G G~ E D C D E E E E D D E D C~'
  },
  {
    id: 'london',
    title: 'ロンドン橋',
    category: '童謡・伝承',
    notation: 'G A G F E F G~ D E F~ E F G~ G A G F E F G~ D~ G E C~'
  },
  {
    id: 'abc',
    title: 'ABCの歌',
    category: '童謡・伝承',
    notation: 'C C G G A A G~ F F E E D D C~ G G F F E E D~ G G F F E E D~ C C G G A A G~ F F E E D D C~'
  },
  {
    id: 'kogitsune',
    title: 'こぎつね',
    category: '童謡・伝承',
    notation: 'G E E F D D C E G G G E G C+ G E E F D D C E G G C~'
  },
  {
    id: 'saints',
    title: '聖者の行進',
    category: '童謡・伝承',
    notation: 'C E F G~ C E F G~ C E F G E C E D~ E E D C C E~ E F E D~ C E E E E E E D E F G F E D C~'
  },
  {
    id: 'brown-jug',
    title: '茶色のこびん',
    composer: 'J. E. Winner',
    category: '童謡・伝承',
    notation: 'C C E E G F E D C C E E G F E D~ C E G C+~ A G F E D F A C+~ A G F E D~'
  },
  {
    id: 'chocho',
    title: 'ちょうちょう',
    category: '童謡・伝承',
    notation: 'G E E~ F D D~ C D E F G G G~ G E E~ F D D~ C E G G E~ D~ D D D D D E F~ E E E E E F G~ G E E~ F D D~ C E G G E~ C~'
  },
  {
    id: 'musunde',
    title: 'むすんでひらいて',
    category: '童謡・伝承',
    notation: 'C C G G A G~ F F E E D C~ C C G G A G~ F F E E D C~'
  },
  {
    id: 'kaeru',
    title: 'かえるの合唱',
    category: '童謡・伝承',
    notation: 'C D E F E D C~ E F G A G F E~ C C C C C C C C C D E F E D C~'
  },
  {
    id: 'old-clock',
    title: 'おおきな古時計',
    composer: 'H. C. Work',
    category: '童謡・伝承',
    notation: 'C E G G G F E D C E G~ A G F~ E D D D E F~ E D C~ G+ E+ C+ E+ G G C+~ B A G A G F E D C~'
  },
  {
    id: 'old-mac',
    title: 'Old MacDonald',
    category: '童謡・伝承',
    notation: 'G G G D E E D~ B B A A G~ G D G G G D E E D~ B B A A G~'
  },
  {
    id: 'yankee',
    title: 'ヤンキードゥードゥル',
    category: '童謡・伝承',
    notation: 'C C D E C E D G C C D E C~ B~ C C D E F E D C B G A B C C~'
  },
  {
    id: 'row-boat',
    title: 'Row Row Row Your Boat',
    category: '童謡・伝承',
    notation: 'C~ C~ C D E~ E D E F G~ C+ C+ C+ G G G E E E C C C G F E D C~'
  },
  {
    id: 'frere-jacques',
    title: 'フレール・ジャック',
    category: '童謡・伝承',
    notation: 'C D E C C D E C E F G~ E F G~ G A G F E C~ G A G F E C~ C G- C~ C G- C~'
  },
  {
    id: 'hb',
    title: 'ハッピーバースデー',
    category: '童謡・伝承',
    notation: 'C C D C F E~ C C D C G F~ C C C+ A F E D~ A#- A#- A F G F~'
  },
  {
    id: 'jingle',
    title: 'ジングルベル',
    category: 'クリスマス・賛美歌',
    notation: 'E E E~ E E E~ E G C D E~~ F F F F F E E E E D D E D~ G~ E E E~ E E E~ E G C D E~~ F F F F F E E E G G F D C~'
  },
  {
    id: 'we-wish',
    title: 'おめでとうクリスマス',
    category: 'クリスマス・賛美歌',
    notation: 'D G G A G F E C E A A B A G F D D D B B C+ B A F D G G E F D C~'
  },
  {
    id: 'silent-night',
    title: 'きよしこの夜',
    composer: 'F. Gruber',
    category: 'クリスマス・賛美歌',
    notation: 'G A G E~ G A G E~ D D B~ C C G~ A A C+ B A G A G E~ A A C+ B A G A G E~ D D F D B G~ C C E C G~ E~'
  },
  {
    id: 'auld-lang',
    title: 'オールド・ラング・サイン (蛍の光)',
    category: '童謡・伝承',
    notation: 'C F~ F F A G F G A~ G F F A C+~ D+ C+ A F~ G F F A G F D D F C~ A F F A G F G C+~ A F F A C+ D+~ C+ A F G F F D C F G~'
  },

  // ===== クラシック (29) =====
  {
    id: 'bach-minuet',
    title: 'メヌエット ト長調',
    composer: 'J.S.バッハ',
    category: 'クラシック',
    notation: 'D+ G A B G B G D+ E C+ D B G A B C+ D+ G F# G E A F# G B+~ A B C+ A B G A G F# G A G F# E~ D+~'
  },
  {
    id: 'bach-jesu',
    title: '主よ、人の望みの喜びよ',
    composer: 'J.S.バッハ',
    category: 'クラシック',
    notation: 'G A B D+ C+ D+ E+ C+ D+ E+ F#+ E+ D+ C+ B G A G F# E F# G A B G F# G A G F# E D~'
  },
  {
    id: 'bach-aria',
    title: 'G線上のアリア',
    composer: 'J.S.バッハ',
    category: 'クラシック',
    notation: 'D~ G A B C+~ B C+ A B G A F# G E F# D~ G F# E D C B A G~'
  },
  {
    id: 'mozart-turkish',
    title: 'トルコ行進曲',
    composer: 'モーツァルト',
    category: 'クラシック',
    notation: 'B A G# A C+ B A B D+ C+ B C+ E+ D+ C# D+ B+ A+ G#+ A+ E+ A+~ G#+ F#+ E+ F#+ A+~'
  },
  {
    id: 'mozart-eine',
    title: 'アイネ・クライネ・ナハトムジーク',
    composer: 'モーツァルト',
    category: 'クラシック',
    notation: 'G G D+~ G G D+~ G D+ G+ F#+ E+ D+ C+ B A G B D+ G~ A A E+~ A A E+~ A E+ A+ G+ F#+ E+ D+ C+ B C+ A D+~'
  },
  {
    id: 'mozart-twinkle',
    title: 'きらきら星変奏曲（主題）',
    composer: 'モーツァルト',
    category: 'クラシック',
    notation: 'C C G G A A G~ F F E E D D C~ G G F F E E D~ G G F F E E D~ C C G G A A G~ F F E E D D C~'
  },
  {
    id: 'beet-elise',
    title: 'エリーゼのために',
    composer: 'ベートーヴェン',
    category: 'クラシック',
    notation: 'E+ D#+ E+ D#+ E+ B D+ C+ A C E A B E G# B C+ E B C+ D+ E+ G C+ D+ E+ E+ D#+ E+ D#+ E+ B D+ C+ A~'
  },
  {
    id: 'beet-ode',
    title: '歓喜の歌（第九）',
    composer: 'ベートーヴェン',
    category: 'クラシック',
    notation: 'E E F G G F E D C C D E E~ D D~ E E F G G F E D C C D E D C C~'
  },
  {
    id: 'beet-moonlight',
    title: '月光ソナタ（冒頭）',
    composer: 'ベートーヴェン',
    category: 'クラシック',
    notation: 'C# G# C+# C# G# C+# C# G# C+# C# G# C+# B G# D+# B G# D+# B G# D+# B G# D+#'
  },
  {
    id: 'beet-fate',
    title: '運命（第5番冒頭）',
    composer: 'ベートーヴェン',
    category: 'クラシック',
    notation: 'G G G D#~ F F F D~ G G G D# F F F D C+ B A G F E D C~'
  },
  {
    id: 'chopin-tristesse',
    title: '別れの曲',
    composer: 'ショパン',
    category: 'クラシック',
    notation: 'E E F# G# G# A# B C+# B A# G# F# E F# G# F# E D# C# B- C# E F# G# F# E~'
  },
  {
    id: 'chopin-nocturne',
    title: 'ノクターン Op.9-2',
    composer: 'ショパン',
    category: 'クラシック',
    notation: 'G+ F+ E+~ B+ A+ G+~ F+ E+ D+~ A+ G+ F+~ E+ D+ E+ F+ E+ D+ C+ B A G F E D~'
  },
  {
    id: 'chopin-waltz',
    title: '子犬のワルツ',
    composer: 'ショパン',
    category: 'クラシック',
    notation: 'D#+ E+ D#+ E+ D#+ B D+ C+ A G F# G A B C+ D+ E+ F#+ G+ F+ E+ D+ C+ B A G F# E D'
  },
  {
    id: 'debussy-clair',
    title: '月の光（冒頭）',
    composer: 'ドビュッシー',
    category: 'クラシック',
    notation: 'D#+ F+ A#+ A#+ G+ F+ A#+~ A#+ G+ F+ D#+~ G+ F+ D#+ F+ A#+ A#+ G+ F+ A#+ D+#~'
  },
  {
    id: 'debussy-flax',
    title: '亜麻色の髪の乙女',
    composer: 'ドビュッシー',
    category: 'クラシック',
    notation: 'G#+ F#+ E+ C#+ B G# B C#+ E+ F#+ G#+~ F#+ E+ C#+ B C#+ E+~ B G# F#~ E~'
  },
  {
    id: 'pachelbel-canon',
    title: 'カノン',
    composer: 'パッヘルベル',
    category: 'クラシック',
    notation: 'F#+ E+ D+ C#+ B A B C#+ D+ C#+ B A G F# G E F# G A G F# G E F# D~ A B C#+ D+ E+ D+ C#+ B A G F#~'
  },
  {
    id: 'vivaldi-spring',
    title: '春（四季）',
    composer: 'ヴィヴァルディ',
    category: 'クラシック',
    notation: 'E G G G F# E D C# D E E E~ E G G G F# E D C# D E E A~ A E E E E F# G F# E D~ B B B B B C+ D+ C+ B A G~'
  },
  {
    id: 'brahms-lullaby',
    title: '子守歌',
    composer: 'ブラームス',
    category: 'クラシック',
    notation: 'E E G~ E E G~ E G C+ B A G F E F G~ D D F~ D D F~ D F B A G F~ E~ D~ C~'
  },
  {
    id: 'brahms-hungarian',
    title: 'ハンガリー舞曲第5番',
    composer: 'ブラームス',
    category: 'クラシック',
    notation: 'F#+ E+ D+ E+ F#+ A+ G+ F#+ E+ D+ C#+ D+~ A B C#+ D+ E+ F#+ G+ F#+ E+ D+ C#+ D+~'
  },
  {
    id: 'schubert-nobara',
    title: '野ばら',
    composer: 'シューベルト',
    category: 'クラシック',
    notation: 'C E G C+~ B A G E F~ D~ G E C~ C E G C+~ B A G E F D C~'
  },
  {
    id: 'schubert-ave',
    title: 'アヴェ・マリア',
    composer: 'シューベルト',
    category: 'クラシック',
    notation: 'F~ F G F D F~ A~ A A# A G F G A~ A# A G A B A~ G F E F G A B A G F E D~ C~'
  },
  {
    id: 'schubert-march',
    title: '軍隊行進曲',
    composer: 'シューベルト',
    category: 'クラシック',
    notation: 'D D D F~ A~ A~ G F G A G F E~ D D D F~ A~ A~ G F G A G F D~'
  },
  {
    id: 'tchaik-swan',
    title: '白鳥の湖',
    composer: 'チャイコフスキー',
    category: 'クラシック',
    notation: 'B C+ D+ E+ B C+ D+ E+ F+ E+ D+ C+ B A G F# E~ G A B C+ B A G F# G F# E~'
  },
  {
    id: 'tchaik-march',
    title: '行進曲（くるみ割り人形）',
    composer: 'チャイコフスキー',
    category: 'クラシック',
    notation: 'G E~ G E~ G G G E~ A F~ A F~ A A A F~ G E~ G E~ G G E E G~ F D~ F D~ F F D D F~'
  },
  {
    id: 'handel-hornpipe',
    title: 'アラ・ホーンパイプ（水上の音楽）',
    composer: 'ヘンデル',
    category: 'クラシック',
    notation: 'D F# A D+~ A F# D~ E G B E+~ B G E~ F# A D+ F#+~ D+ A F#~ E G E+~ A G F#~ E F# G A B C#+ D+~'
  },
  {
    id: 'grieg-morning',
    title: '朝（ペールギュント）',
    composer: 'グリーグ',
    category: 'クラシック',
    notation: 'G E D C D E G E D C D E G A G E A G E A G E G F# E~'
  },
  {
    id: 'bizet-habanera',
    title: 'ハバネラ（カルメン）',
    composer: 'ビゼー',
    category: 'クラシック',
    notation: 'D D C# C C B- A#- A- D D C# C C B- A#- A- B- A#- A- G#- A- B- C C# D~'
  },
  {
    id: 'elgar-pomp',
    title: '威風堂々',
    composer: 'エルガー',
    category: 'クラシック',
    notation: 'B A G E~ A G F# D~ G F# E B-~ E~ D+ C+ B G B A G E A B C+ B A G F# E D~'
  },
  {
    id: 'satie-gymno',
    title: 'ジムノペディ第1番',
    composer: 'サティ',
    category: 'クラシック',
    notation: 'F+ E+~ F+ E+~ A B C+ D+ C+ B A G F~ E+~ D+ C+~ B A~ G F~ E D~ C~ D~ E~ F~ G~ A~'
  },
  {
    id: 'amazing-grace',
    title: 'アメイジング・グレイス',
    category: 'クリスマス・賛美歌',
    notation: 'D G B G B A G E D~ G B A G B B~ A~ G B B G E D D~ G B A G E D~'
  }
];
