import { Plugin } from '@/types/plugin';
import p_0 from '@plugins/arabic/ArNovel[madara]';
import p_1 from '@plugins/arabic/Azora[madara]';
import p_2 from '@plugins/arabic/dilartube';
import p_3 from '@plugins/arabic/FreeKolNovel[lightnovelwp]';
import p_4 from '@plugins/arabic/HizoManga[madara]';
import p_5 from '@plugins/arabic/KolNovel[lightnovelwp]';
import p_6 from '@plugins/arabic/Novel4Up[madara]';
import p_7 from '@plugins/arabic/NovelsParadise[lightnovelwp]';
import p_8 from '@plugins/arabic/Olaoecyou[madara]';
import p_9 from '@plugins/arabic/rewayatclub';
import p_10 from '@plugins/arabic/Riwyat[madara]';
import p_11 from '@plugins/arabic/sunovels';
import p_12 from '@plugins/chinese/69shu';
import p_13 from '@plugins/chinese/ixdzs8';
import p_14 from '@plugins/chinese/linovel';
import p_15 from '@plugins/chinese/linovelib';
import p_16 from '@plugins/chinese/linovelib_tw';
import p_17 from '@plugins/chinese/novel543';
import p_18 from '@plugins/chinese/Quanben';
import p_19 from '@plugins/english/AllNovelFull[readnovelfull]';
import p_20 from '@plugins/english/AllNovel[readnovelfull]';
import p_21 from '@plugins/english/ao3';
import p_22 from '@plugins/english/ArcaneTranslations[lightnovelwp]';
import p_23 from '@plugins/english/BelleReservoir[madara]';
import p_24 from '@plugins/english/BoxNovel[readnovelfull]';
import p_25 from '@plugins/english/chrysanthemumgarden';
import p_26 from '@plugins/english/CitrusAurora[madara]';
import p_27 from '@plugins/english/CoralBoutique[madara]';
import p_28 from '@plugins/english/CPUnovel[lightnovelwp]';
import p_29 from '@plugins/english/crimsonscrolls';
import p_30 from '@plugins/english/DaoistQuest[fictioneer]';
import p_31 from '@plugins/english/DaoNovel[madara]';
import p_32 from '@plugins/english/DaoTranslate[lightnovelwp]';
import p_33 from '@plugins/english/DearestRosalie[fictioneer]';
import p_34 from '@plugins/english/divinedaolibrary';
import p_35 from '@plugins/english/Dragonholic[madara]';
import p_36 from '@plugins/english/DragonTea[madara]';
import p_37 from '@plugins/english/dreambigtl';
import p_38 from '@plugins/english/DuskBlossoms[madara]';
import p_39 from '@plugins/english/ElloTL[lightnovelwp]';
import p_40 from '@plugins/english/Eternalune[madara]';
import p_41 from '@plugins/english/EtudeTranslations[madara]';
import p_42 from '@plugins/english/FanNovel[readwn]';
import p_43 from '@plugins/english/FansMTL[readwn]';
import p_44 from '@plugins/english/FansTranslations[madara]';
import p_45 from '@plugins/english/faqwikius';
import p_46 from '@plugins/english/fenrirrealm';
import p_47 from '@plugins/english/fictionzone';
import p_48 from '@plugins/english/FirstKissNovel[madara]';
import p_49 from '@plugins/english/Foxaholic[madara]';
import p_50 from '@plugins/english/foxteller';
import p_51 from '@plugins/english/FreeWebNovel[readnovelfull]';
import p_52 from '@plugins/english/GalaxyTranslations[madara]';
import p_53 from '@plugins/english/genesis';
import p_54 from '@plugins/english/Guavaread[madara]';
import p_55 from '@plugins/english/HiraethTranslation[madara]';
import p_56 from '@plugins/english/HotNovelPub[hotnovelpub]';
import p_57 from '@plugins/english/inkitt';
import p_58 from '@plugins/english/Ippotranslations[lightnovelwp]';
import p_59 from '@plugins/english/KDTNovels[lightnovelwp]';
import p_60 from '@plugins/english/KeopiTranslations[lightnovelwp]';
import p_61 from '@plugins/english/KnoxT[lightnovelwp]';
import p_62 from '@plugins/english/LazyGirlTranslations[lightnovelwp]';
import p_63 from '@plugins/english/leafstudio';
import p_64 from '@plugins/english/LibRead[readnovelfull]';
import p_65 from '@plugins/english/LightNovelCave[lightnovelworld]';
import p_66 from '@plugins/english/LightNovelHeaven[madara]';
import p_67 from '@plugins/english/LightNovelPlus[readnovelfull]';
import p_68 from '@plugins/english/LightNovelPubVip[lightnovelworld]';
import p_69 from '@plugins/english/lightnoveltranslation';
import p_70 from '@plugins/english/LightNovelUpdates[madara]';
import p_71 from '@plugins/english/LilyontheValley[fictioneer]';
import p_72 from '@plugins/english/lnmtl';
import p_73 from '@plugins/english/Ltnovel[readwn]';
import p_74 from '@plugins/english/LunarLetters[madara]';
import p_75 from '@plugins/english/Meownovel[madara]';
import p_76 from '@plugins/english/MoonlightNovels[lightnovelwp]';
import p_77 from '@plugins/english/MostNovel[madara]';
import p_78 from '@plugins/english/MTLNovel[madara]';
import p_79 from '@plugins/english/MTLNovel[mtlnovel]';
import p_80 from '@plugins/english/mtlreader';
import p_81 from '@plugins/english/mvlempyr';
import p_82 from '@plugins/english/MysticalSeries[madara]';
import p_83 from '@plugins/english/NeoSekaiTranslations[madara]';
import p_84 from '@plugins/english/NitroManga[madara]';
import p_85 from '@plugins/english/NobleMTL[lightnovelwp]';
import p_86 from '@plugins/english/NoiceTranslations[madara]';
import p_87 from '@plugins/english/NovelBin[readnovelfull]';
import p_88 from '@plugins/english/novelbuddy';
import p_89 from '@plugins/english/NovelCool[novelcool]';
import p_90 from '@plugins/english/novelfire';
import p_91 from '@plugins/english/NovelFull[readnovelfull]';
import p_92 from '@plugins/english/novelhall';
import p_93 from '@plugins/english/novelight';
import p_94 from '@plugins/english/NovelLib[fictioneer]';
import p_95 from '@plugins/english/NovelMultiverse[madara]';
import p_96 from '@plugins/english/NovelOnline';
import p_97 from '@plugins/english/NovelsKnight[lightnovelwp]';
import p_98 from '@plugins/english/NovelTranslate[madara]';
import p_99 from '@plugins/english/novelupdates';
import p_100 from '@plugins/english/PandaMachineTranslations[lightnovelwp]';
import p_101 from '@plugins/english/PastelTales[madara]';
import p_102 from '@plugins/english/pawread';
import p_103 from '@plugins/english/PenguinSquad[fictioneer]';
import p_104 from '@plugins/english/Prizma[fictioneer]';
import p_105 from '@plugins/english/rainofsnow';
import p_106 from '@plugins/english/Ranobes[ranobes]';
import p_107 from '@plugins/english/Ranovel[madara]';
import p_108 from '@plugins/english/ReadFanfic[madara]';
import p_109 from '@plugins/english/readfrom';
import p_110 from '@plugins/english/ReadNovelFull[readnovelfull]';
import p_111 from '@plugins/english/relibrary';
import p_112 from '@plugins/english/RequiemTranslations[lightnovelwp]';
import p_113 from '@plugins/english/royalroad';
import p_114 from '@plugins/english/SalmonLatte[madara]';
import p_115 from '@plugins/english/scribblehub';
import p_116 from '@plugins/english/SleepyTranslations[madara]';
import p_117 from '@plugins/english/SonicMTL[madara]';
import p_118 from '@plugins/english/SrankManga[madara]';
import p_119 from '@plugins/english/StorySeedling';
import p_120 from '@plugins/english/SweetEscape[madara]';
import p_121 from '@plugins/english/SystemTranslation[lightnovelwp]';
import p_122 from '@plugins/english/TranslatinOtaku[madara]';
import p_123 from '@plugins/english/TranslationWeaver[lightnovelwp]';
import p_124 from '@plugins/english/UniversalNovel[lightnovelwp]';
import p_125 from '@plugins/english/VandyTranslate[lightnovelwp]';
import p_126 from '@plugins/english/VioletLily[madara]';
import p_127 from '@plugins/english/vynovel';
import p_128 from '@plugins/english/webnovel';
import p_129 from '@plugins/english/WebNovelLover[madara]';
import p_130 from '@plugins/english/WebNovelPub[lightnovelworld]';
import p_131 from '@plugins/english/WebNovelTranslation[madara]';
import p_132 from '@plugins/english/WhiteMoonlightNovels[lightnovelwp]';
import p_133 from '@plugins/english/WooksTeahouse[madara]';
import p_134 from '@plugins/english/WordExcerpt[madara]';
import p_135 from '@plugins/english/wtrlab';
import p_136 from '@plugins/english/Wuxiabox[readwn]';
import p_137 from '@plugins/english/Wuxiafox[readwn]';
import p_138 from '@plugins/english/WuxiaSpace[readwn]';
import p_139 from '@plugins/english/WuxiaV[readwn]';
import p_140 from '@plugins/english/wuxiaworld';
import p_141 from '@plugins/english/WuxiaWorldSite[madara]';
import p_142 from '@plugins/english/ZetroTranslation[madara]';
import p_143 from '@plugins/french/chireads';
import p_144 from '@plugins/french/harkeneliwood';
import p_145 from '@plugins/french/kisswood';
import p_146 from '@plugins/french/LighNovelFR[lightnovelwp]';
import p_147 from '@plugins/french/MassNovel[madara]';
import p_148 from '@plugins/french/MTLNovel(FR)[mtlnovel]';
import p_149 from '@plugins/french/noveldeglace';
import p_150 from '@plugins/french/novhell';
import p_151 from '@plugins/french/warriorlegendtrad';
import p_152 from '@plugins/french/WorldNovel[madara]';
import p_153 from '@plugins/french/wuxialnscantrad';
import p_154 from '@plugins/french/xiaowaz';
import p_155 from '@plugins/indonesian/BacaLightNovel[lightnovelwp]';
import p_156 from '@plugins/indonesian/indowebnovel';
import p_157 from '@plugins/indonesian/MeioNovel[madara]';
import p_158 from '@plugins/indonesian/MTLNovel(ID)[mtlnovel]';
import p_159 from '@plugins/indonesian/NovelBookID[madara]';
import p_160 from '@plugins/indonesian/sakuranovel';
import p_161 from '@plugins/indonesian/SekteNovel[lightnovelwp]';
import p_162 from '@plugins/indonesian/Vanovel[madara]';
import p_163 from '@plugins/indonesian/WBNovel[madara]';
import p_164 from '@plugins/japanese/kakuyomu';
import p_165 from '@plugins/japanese/Syosetu';
import p_166 from '@plugins/korean/Agitoon';
import p_167 from '@plugins/korean/FortuneEternal[madara]';
import p_168 from '@plugins/multi/komga';
import p_169 from '@plugins/polish/novelki';
import p_170 from '@plugins/portuguese/BetterNovels[lightnovelwp]';
import p_171 from '@plugins/portuguese/blogdoamonnovels';
import p_172 from '@plugins/portuguese/CentralNovel[lightnovelwp]';
import p_173 from '@plugins/portuguese/Kiniga[madara]';
import p_174 from '@plugins/portuguese/LaNovels[hotnovelpub]';
import p_175 from '@plugins/portuguese/LightNovelBrasil[lightnovelwp]';
import p_176 from '@plugins/portuguese/MTLNovel(PT)[mtlnovel]';
import p_177 from '@plugins/portuguese/novelmania';
import p_178 from '@plugins/portuguese/tsundoku';
import p_179 from '@plugins/russian/authortoday';
import p_180 from '@plugins/russian/Bookhamster[ifreedom]';
import p_181 from '@plugins/russian/bookriver';
import p_182 from '@plugins/russian/Erolate[rulate]';
import p_183 from '@plugins/russian/EzNovels[hotnovelpub]';
import p_184 from '@plugins/russian/ficbook';
import p_185 from '@plugins/russian/jaomix';
import p_186 from '@plugins/russian/MTLNovel(RU)[mtlnovel]';
import p_187 from '@plugins/russian/neobook';
import p_188 from '@plugins/russian/NovelCool(RU)[novelcool]';
import p_189 from '@plugins/russian/novelTL';
import p_190 from '@plugins/russian/ranobehub';
import p_191 from '@plugins/russian/ranobelib';
import p_192 from '@plugins/russian/ranoberf';
import p_193 from '@plugins/russian/Ranobes(RU)[ranobes]';
import p_194 from '@plugins/russian/renovels';
import p_195 from '@plugins/russian/Rulate[rulate]';
import p_196 from '@plugins/russian/topliba';
import p_197 from '@plugins/russian/zelluloza';
import p_198 from '@plugins/russian/СвободныйМирРанобэ[ifreedom]';
import p_199 from '@plugins/spanish/AllNovelRead[lightnovelwp]';
import p_200 from '@plugins/spanish/AnimesHoy12[madara]';
import p_201 from '@plugins/spanish/hasutl';
import p_202 from '@plugins/spanish/LightNovelDaily[hotnovelpub]';
import p_203 from '@plugins/spanish/MTLNovel(ES)[mtlnovel]';
import p_204 from '@plugins/spanish/novelasligera';
import p_205 from '@plugins/spanish/novelawuxia';
import p_206 from '@plugins/spanish/oasistranslations';
import p_207 from '@plugins/spanish/PanchoTranslations[madara]';
import p_208 from '@plugins/spanish/skynovels';
import p_209 from '@plugins/spanish/TC&Sega[lightnovelwp]';
import p_210 from '@plugins/spanish/TraduccionesAmistosas[madara]';
import p_211 from '@plugins/spanish/tunovelaligera';
import p_212 from '@plugins/spanish/yukitls';
import p_213 from '@plugins/thai/NovelLucky[madara]';
import p_214 from '@plugins/thai/NovelPDF[madara]';
import p_215 from '@plugins/turkish/ArazNovel[madara]';
import p_216 from '@plugins/turkish/EKTAPLAR[madara]';
import p_217 from '@plugins/turkish/epiknovel';
import p_218 from '@plugins/turkish/kakikata[madara]';
import p_219 from '@plugins/turkish/KodeksLibrary[lightnovelwp]';
import p_220 from '@plugins/turkish/MangaTR';
import p_221 from '@plugins/turkish/NABSCANS[madara]';
import p_222 from '@plugins/turkish/Namevt[lightnovelwp]';
import p_223 from '@plugins/turkish/Noveloku[madara]';
import p_224 from '@plugins/turkish/NovelTR[lightnovelwp]';
import p_225 from '@plugins/turkish/RagnarScans[madara]';
import p_226 from '@plugins/turkish/ThNovels[hotnovelpub]';
import p_227 from '@plugins/turkish/TurkceLightNovels[madara]';
import p_228 from '@plugins/turkish/WebNovelOku[madara]';
import p_229 from '@plugins/ukrainian/bakainua';
import p_230 from '@plugins/ukrainian/smakolykytl';
import p_231 from '@plugins/vietnamese/lightnovelvn';
import p_232 from '@plugins/vietnamese/LNHako';
import p_233 from '@plugins/vietnamese/nettruyen';

const PLUGINS: Plugin.PluginBase[] = [
  p_0,
  p_1,
  p_2,
  p_3,
  p_4,
  p_5,
  p_6,
  p_7,
  p_8,
  p_9,
  p_10,
  p_11,
  p_12,
  p_13,
  p_14,
  p_15,
  p_16,
  p_17,
  p_18,
  p_19,
  p_20,
  p_21,
  p_22,
  p_23,
  p_24,
  p_25,
  p_26,
  p_27,
  p_28,
  p_29,
  p_30,
  p_31,
  p_32,
  p_33,
  p_34,
  p_35,
  p_36,
  p_37,
  p_38,
  p_39,
  p_40,
  p_41,
  p_42,
  p_43,
  p_44,
  p_45,
  p_46,
  p_47,
  p_48,
  p_49,
  p_50,
  p_51,
  p_52,
  p_53,
  p_54,
  p_55,
  p_56,
  p_57,
  p_58,
  p_59,
  p_60,
  p_61,
  p_62,
  p_63,
  p_64,
  p_65,
  p_66,
  p_67,
  p_68,
  p_69,
  p_70,
  p_71,
  p_72,
  p_73,
  p_74,
  p_75,
  p_76,
  p_77,
  p_78,
  p_79,
  p_80,
  p_81,
  p_82,
  p_83,
  p_84,
  p_85,
  p_86,
  p_87,
  p_88,
  p_89,
  p_90,
  p_91,
  p_92,
  p_93,
  p_94,
  p_95,
  p_96,
  p_97,
  p_98,
  p_99,
  p_100,
  p_101,
  p_102,
  p_103,
  p_104,
  p_105,
  p_106,
  p_107,
  p_108,
  p_109,
  p_110,
  p_111,
  p_112,
  p_113,
  p_114,
  p_115,
  p_116,
  p_117,
  p_118,
  p_119,
  p_120,
  p_121,
  p_122,
  p_123,
  p_124,
  p_125,
  p_126,
  p_127,
  p_128,
  p_129,
  p_130,
  p_131,
  p_132,
  p_133,
  p_134,
  p_135,
  p_136,
  p_137,
  p_138,
  p_139,
  p_140,
  p_141,
  p_142,
  p_143,
  p_144,
  p_145,
  p_146,
  p_147,
  p_148,
  p_149,
  p_150,
  p_151,
  p_152,
  p_153,
  p_154,
  p_155,
  p_156,
  p_157,
  p_158,
  p_159,
  p_160,
  p_161,
  p_162,
  p_163,
  p_164,
  p_165,
  p_166,
  p_167,
  p_168,
  p_169,
  p_170,
  p_171,
  p_172,
  p_173,
  p_174,
  p_175,
  p_176,
  p_177,
  p_178,
  p_179,
  p_180,
  p_181,
  p_182,
  p_183,
  p_184,
  p_185,
  p_186,
  p_187,
  p_188,
  p_189,
  p_190,
  p_191,
  p_192,
  p_193,
  p_194,
  p_195,
  p_196,
  p_197,
  p_198,
  p_199,
  p_200,
  p_201,
  p_202,
  p_203,
  p_204,
  p_205,
  p_206,
  p_207,
  p_208,
  p_209,
  p_210,
  p_211,
  p_212,
  p_213,
  p_214,
  p_215,
  p_216,
  p_217,
  p_218,
  p_219,
  p_220,
  p_221,
  p_222,
  p_223,
  p_224,
  p_225,
  p_226,
  p_227,
  p_228,
  p_229,
  p_230,
  p_231,
  p_232,
  p_233,
];
export default PLUGINS;
