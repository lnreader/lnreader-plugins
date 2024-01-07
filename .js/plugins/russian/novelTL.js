"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var filterInputs_1 = require("@libs/filterInputs");
var defaultCover_1 = require("@libs/defaultCover");
var fetch_1 = require("@libs/fetch");
var novelStatus_1 = require("@libs/novelStatus");
var cheerio_1 = require("cheerio");
var dayjs_1 = __importDefault(require("dayjs"));
var TL = /** @class */ (function () {
    function TL() {
        this.id = "TL";
        this.name = "NovelTL";
        this.site = "https://novel.tl";
        this.version = "1.0.0";
        this.icon = "src/ru/noveltl/icon.png";
        this.userAgent = "";
        this.cookieString = "";
        this.fetchImage = fetch_1.fetchFile;
        this.filters = {
            tags: {
                label: "Тэги",
                value: [],
                options: [
                    { label: "Автоматы", value: "64" },
                    { label: "Агрессивные персонажи", value: "26" },
                    { label: "Ад", value: "338" },
                    { label: "Адаптация манги", value: "8" },
                    { label: "Академия", value: "5" },
                    { label: "Актёрское искусство", value: "7" },
                    { label: "Актеры озвучки", value: "746" },
                    { label: "Алхимия", value: "27" },
                    { label: "Альтернативная реальность", value: "30" },
                    { label: "Амнезия", value: "31" },
                    { label: "Анабиоз", value: "170" },
                    { label: "Анал", value: "33" },
                    { label: "Ангелы", value: "38" },
                    { label: "Андроиды", value: "37" },
                    { label: "Анти-рост персонажа", value: "25" },
                    { label: "Антигерой", value: "43" },
                    { label: "Антикварный магазин", value: "44" },
                    { label: "Антимагия", value: "41" },
                    { label: "Антиутопия", value: "225" },
                    { label: "Апатичный главный герой", value: "46" },
                    { label: "Апокалипсис", value: "47" },
                    { label: "Аристократия", value: "51" },
                    { label: "Армия", value: "53" },
                    { label: "Артефакты", value: "58" },
                    { label: "Асоциальный главный герой", value: "42" },
                    { label: "Ассасины", value: "61" },
                    { label: "Атмосфера Европы", value: "245" },
                    { label: "Банды", value: "302" },
                    { label: "БДСМ", value: "77" },
                    { label: "Бедный главный герой", value: "541" },
                    { label: "Бездушный главный герой", value: "143" },
                    { label: "Беззаботный герой", value: "115" },
                    { label: "Безответная любовь", value: "213" },
                    { label: "Безответная любовь", value: "740" },
                    { label: "Безработные", value: "377" },
                    { label: "Беременность", value: "551" },
                    { label: "Бескорыстная любовь", value: "733" },
                    { label: "Бессмертные", value: "359" },
                    { label: "Бесстрашный главный герой", value: "274" },
                    { label: "Библиотека", value: "393" },
                    { label: "Биография", value: "86" },
                    { label: "Близнецы", value: "729" },
                    { label: "Богачи", value: "753" },
                    { label: "Боги", value: "318" },
                    { label: "Богини", value: "316" },
                    { label: "Богоподобный протагонист", value: "314" },
                    { label: "Боевая академия", value: "75" },
                    { label: "Боевая парочка", value: "547" },
                    { label: "Божественная защита", value: "208" },
                    { label: "Божественная сила", value: "317" },
                    { label: "Болеющие персонажи", value: "648" },
                    { label: "Борьба за власть", value: "548" },
                    { label: "Брак по расчету", value: "55" },
                    { label: "Братство", value: "106" },
                    { label: "Братья или сёстры", value: "646" },
                    { label: "Брошенные дети", value: "1" },
                    { label: "Бывший герой", value: "290" },
                    { label: "Вампиры", value: "742" },
                    { label: "Ваншот", value: "496" },
                    { label: "Вдали от родителей", value: "3" },
                    { label: "Ведьмы", value: "756" },
                    { label: "Везучий главный герой", value: "411" },
                    { label: "Верные подданные", value: "410" },
                    { label: "Вероломные герои/плетение интриг", value: "424" },
                    { label: "Взросление персонажа", value: "24" },
                    { label: "Видит то, чего остальной люд не в силах", value: "617" },
                    { label: "Виртуальная реальность", value: "744" },
                    { label: "Владелец магазина", value: "677" },
                    { label: "Владелец уникального оружия", value: "736" },
                    { label: "Властные персонажи", value: "545" },
                    { label: "Влияние прошлого", value: "517" },
                    { label: "Внезапное обогащение", value: "691" },
                    { label: "Внезапное обретение силы", value: "690" },
                    { label: "Военные хроники", value: "749" },
                    { label: "Возвращение в родной мир", value: "587" },
                    { label: "Война", value: "750" },
                    { label: "Вокалоид", value: "745" },
                    { label: "Волшебные твари", value: "413" },
                    { label: "Воскрешение", value: "586" },
                    { label: "Воспитанный главный герой", value: "537" },
                    { label: "Воспоминания прошлого", value: "283" },
                    { label: "Враги становятся союзниками", value: "238" },
                    { label: "Врата в иной мир", value: "303" },
                    { label: "Временной парадокс", value: "711" },
                    { label: "Вторжение на Землю", value: "228" },
                    { label: "Второй шанс", value: "608" },
                    { label: "Выживание", value: "695" },
                    { label: "Вынужденные условия проживания", value: "287" },
                    { label: "Высокомерный герой", value: "56" },
                    { label: "Гадание", value: "207" },
                    { label: "Галлюцинации", value: "189" },
                    { label: "Гарем рабов", value: "656" },
                    { label: "Геймеры", value: "301" },
                    { label: "Генетические модификации", value: "306" },
                    { label: "Герои", value: "341" },
                    { label: "Герои непонятного пола", value: "36" },
                    { label: "Героиня девушка-сорванец", value: "715" },
                    { label: "Героиня красавица", value: "81" },
                    { label: "Герой влюбляется первым", value: "561" },
                    { label: "Герой использует щит", value: "636" },
                    { label: "Герой красавец", value: "329" },
                    { label: "Герой со множеством тел", value: "564" },
                    { label: "Герой-бесстыдник", value: "632" },
                    { label: "Герой-извращенец", value: "521" },
                    { label: "Герой-трудяга", value: "330" },
                    { label: "Герой-яндере", value: "421" },
                    { label: "Гетерохромия", value: "342" },
                    { label: "Гильдии", value: "324" },
                    { label: "Гиперопека", value: "509" },
                    { label: "Главная героиня — женщина", value: "277" },
                    { label: "Главный герой - гений", value: "308" },
                    { label: "Главный герой - Моб", value: "446" },
                    { label: "Главный герой — знаменитость", value: "263" },
                    { label: "Главный герой — мужчина", value: "419" },
                    { label: "Главный герой в поисках гарема", value: "331" },
                    { label: "Главный герой заранее готовится", value: "557" },
                    { label: "Главный герой не человек", value: "488" },
                    { label: "Главный герой приёмный", value: "20" },
                    { label: "Главный герой сразу силён", value: "563" },
                    { label: "Гладиаторы", value: "310" },
                    { label: "Глухой к любви герой", value: "194" },
                    { label: "Гоблины", value: "313" },
                    { label: "Големы", value: "319" },
                    { label: "Гомункул", value: "347" },
                    { label: "Горничные", value: "418" },
                    { label: "Государственные интриги", value: "212" },
                    { label: "Гринд", value: "322" },
                    { label: "Давняя травма", value: "518" },
                    { label: "Двойник", value: "97" },
                    { label: "Дворецкие", value: "111" },
                    { label: "Дворфы", value: "224" },
                    { label: "Дворяне", value: "487" },
                    { label: "Двоюродные братья или сёстры", value: "162" },
                    { label: "Девочки-волшебницы", value: "415" },
                    { label: "Демоны", value: "193" },
                    { label: "Депрессия", value: "196" },
                    { label: "Детектив", value: "198" },
                    { label: "Детективное расследование", value: "473" },
                    { label: "Детское насилие", value: "125" },
                    { label: "Детское обещание", value: "130" },
                    { label: "Дискриминация", value: "203" },
                    { label: "Длительный разрыв отношений", value: "400" },
                    { label: "Домашняя жизнь", value: "45" },
                    { label: "Драконы", value: "218" },
                    { label: "Древний Китай", value: "34" },
                    { label: "Дружба", value: "293" },
                    { label: "Друзья детства", value: "128" },
                    { label: "Друзья становятся врагами", value: "292" },
                    { label: "Духи", value: "673" },
                    { label: "Духовная сила", value: "665" },
                    { label: "Духовный наставник", value: "671" },
                    { label: "Душещипательная история", value: "335" },
                    { label: "Души", value: "666" },
                    { label: "Дьявольский путь культивации", value: "192" },
                    { label: "Ёкай", value: "763" },
                    { label: "Есть аниме-адаптация", value: "10" },
                    { label: "Есть видеоигра", value: "13" },
                    { label: "Есть дорама-адаптация", value: "11" },
                    { label: "Есть манга-адаптация", value: "14" },
                    { label: "Есть манхва-адаптация", value: "16" },
                    { label: "Есть маньхуа-адаптация", value: "15" },
                    { label: "Есть фильм", value: "17" },
                    { label: "Есть CD дорама-адаптация", value: "12" },
                    { label: "Жёсткий главный герой", value: "597" },
                    { label: "Жестокие персонажи", value: "4" },
                    { label: "Жёстокие персонажи", value: "169" },
                    { label: "Животное-спутник", value: "78" },
                    { label: "Жизнь в одиночку", value: "396" },
                    { label: "Жрецы", value: "555" },
                    { label: "Жрицы", value: "554" },
                    { label: "Забота о детях", value: "127" },
                    { label: "Заботливый главный герой", value: "116" },
                    { label: "Загадочное заболевание", value: "471" },
                    { label: "Загадочное прошлое родителей", value: "470" },
                    { label: "Заговоры", value: "154" },
                    { label: "Закалка тела", value: "96" },
                    { label: "Закон джунглей", value: "682" },
                    { label: "Закулисная борба", value: "603" },
                    { label: "Замкнутый главный герой", value: "371" },
                    { label: "Запечатанная сила", value: "607" },
                    { label: "Затворник", value: "346" },
                    { label: "Звери", value: "80" },
                    { label: "Зверолюди", value: "39" },
                    { label: "Звероподобные", value: "79" },
                    { label: "Земледелие", value: "268" },
                    { label: "Злобные благородные девы", value: "743" },
                    { label: "Зловещие организации", value: "247" },
                    { label: "Злой главный герой", value: "248" },
                    { label: "Злые боги", value: "246" },
                    { label: "Злые религии", value: "249" },
                    { label: "Знаменитости", value: "118" },
                    { label: "Знания из прошлой жизни", value: "553" },
                    { label: "Зомби", value: "767" },
                    { label: "Игра на выживание", value: "696" },
                    { label: "Игровая рейтинговая система", value: "300" },
                    { label: "Из грязи в князи", value: "542" },
                    { label: "Известные родители", value: "262" },
                    { label: "Изменение внешнего вида", value: "48" },
                    { label: "Изнасилование", value: "574" },
                    { label: "Инвалидность", value: "202" },
                    { label: "Индустриализация", value: "364" },
                    { label: "Инженер", value: "241" },
                    { label: "Инцест", value: "361" },
                    { label: "Искажённая личность", value: "730" },
                    { label: "Искусственный интеллект", value: "59" },
                    { label: "Исполнение желаний", value: "755" },
                    { label: "Каннибализм", value: "113" },
                    { label: "Карточные игры", value: "114" },
                    { label: "Кладбищенский смотритель", value: "321" },
                    { label: "Классика", value: "134" },
                    { label: "Книги", value: "99" },
                    { label: "Книги навыков", value: "654" },
                    { label: "Книжный червь", value: "100" },
                    { label: "Коллеги", value: "140" },
                    { label: "Колледж/Университет", value: "145" },
                    { label: "Командная работа", value: "701" },
                    { label: "Комедийный подтекст", value: "147" },
                    { label: "Комплекс брата", value: "105" },
                    { label: "Комплекс неполноценности", value: "365" },
                    { label: "Контракты", value: "155" },
                    { label: "Контроль разума", value: "441" },
                    { label: "Конфликт в семье", value: "261" },
                    { label: "Конфликт верности", value: "153" },
                    { label: "Копейщик", value: "668" },
                    { label: "Королевская особа", value: "596" },
                    { label: "Королевства", value: "382" },
                    { label: "Короткий рассказ", value: "638" },
                    { label: "Коррупция", value: "157" },
                    { label: "Космические Войны", value: "158" },
                    { label: "Космос", value: "507" },
                    { label: "Косплей", value: "159" },
                    { label: "Кража способностей", value: "2" },
                    { label: "Крафтинг", value: "164" },
                    { label: "Кризис личности", value: "357" },
                    { label: "Кровь", value: "320" },
                    { label: "Кружки, клубы", value: "138" },
                    { label: "Кудэрэ", value: "384" },
                    { label: "Кузнец", value: "90" },
                    { label: "Кукловоды", value: "567" },
                    { label: "Куклы/Марионетки", value: "211" },
                    { label: "Кулинария", value: "156" },
                    { label: "Культивация", value: "171" },
                    { label: "Куннилингус", value: "172" },
                    { label: "Легенды", value: "391" },
                    { label: "Легкая жизнь", value: "229" },
                    { label: "Лекари", value: "334" },
                    { label: "Ленивый главный герой", value: "389" },
                    { label: "Лидерство", value: "390" },
                    { label: "Любит персонажа младше себя", value: "765" },
                    { label: "Любит персонажа старше себя", value: "494" },
                    { label: "Любовное соперничество", value: "406" },
                    { label: "Любовные треугольники", value: "407" },
                    { label: "Любовь детства", value: "129" },
                    { label: "Любовь с первого взгляда", value: "404" },
                    { label: "Любящие родители", value: "215" },
                    { label: "Маги", value: "757" },
                    { label: "Магические технологии", value: "417" },
                    { label: "Магия", value: "412" },
                    { label: "Магия призыва", value: "694" },
                    { label: "Маленькие девочки", value: "397" },
                    { label: "Мангака", value: "423" },
                    { label: "Маниакальная любовь", value: "492" },
                    { label: "Марти Сью", value: "508" },
                    { label: "Мастер подземелий", value: "222" },
                    { label: "Мастурбация", value: "432" },
                    { label: "Матриархат", value: "433" },
                    { label: "Межпространственные путешествия", value: "370" },
                    { label: "Менеджмент", value: "422" },
                    { label: "Месть", value: "588" },
                    { label: "Мечи и магия", value: "697" },
                    { label: "Мечники", value: "698" },
                    { label: "Миленькие дети", value: "176" },
                    { label: "Милитаризм", value: "439" },
                    { label: "Миловидная история", value: "178" },
                    { label: "Милый главный герой", value: "177" },
                    { label: "Минет", value: "275" },
                    { label: "Мировое древо", value: "760" },
                    { label: "Миролюбивый главный герой", value: "510" },
                    { label: "Мифология", value: "475" },
                    { label: "Младшие сёстры", value: "766" },
                    { label: "ММОРПГ", value: "445" },
                    { label: "Множество временных линий", value: "463" },
                    { label: "Модели", value: "447" },
                    { label: "Молод не по годам", value: "49" },
                    { label: "Монстры", value: "454" },
                    { label: "Мрачность", value: "183" },
                    { label: "Музыка", value: "466" },
                    { label: "Музыкальные группы", value: "68" },
                    { label: "Мутации", value: "468" },
                    { label: "На волосок от смерти", value: "479" },
                    { label: "На все руки мастер", value: "374" },
                    { label: "Навыки имеют стоимость", value: "150" },
                    { label: "Нагота", value: "490" },
                    { label: "Наездники на драконах", value: "216" },
                    { label: "Наёмники", value: "437" },
                    { label: "Наивный главный герой", value: "476" },
                    { label: "Наследие", value: "366" },
                    { label: "Настоящая любовь", value: "200" },
                    { label: "Настоящий гарем", value: "540" },
                    { label: "Небесное испытание", value: "337" },
                    { label: "Невезучий главный герой", value: "738" },
                    { label: "Недоверчивый протагонист", value: "206" },
                    { label: "Недооцененный главный герой", value: "734" },
                    { label: "Недопонимание", value: "444" },
                    { label: "Некромант", value: "480" },
                    { label: "Нелинейное повествование", value: "489" },
                    { label: "Неловкий главный герой", value: "67" },
                    { label: "Нелюбимый протагонист", value: "333" },
                    { label: "Немой персонаж", value: "469" },
                    { label: "Ненадежный рассказчик", value: "739" },
                    { label: "Непримечательный герой", value: "65" },
                    { label: "Нерешительный протагонист", value: "363" },
                    { label: "Несгибаемый главный герой", value: "676" },
                    { label: "Несколько главных героев", value: "460" },
                    { label: "Несколько миров", value: "461" },
                    { label: "Несколько перерожденцев", value: "462" },
                    { label: "Несколько попаданцев", value: "464" },
                    { label: "Несравненная скорость культивации", value: "269" },
                    { label: "Нехватка/отсутствие здравого смысла", value: "385" },
                    { label: "Нечестный протагонист", value: "205" },
                    { label: "НИИТ", value: "481" },
                    { label: "Ниндзя", value: "486" },
                    { label: "Обмен телами", value: "95" },
                    { label: "Оборотни", value: "754" },
                    { label: "Объект любви влюбился первым", value: "405" },
                    { label: "Объект любви популярен", value: "543" },
                    { label: "Огнестрельное оружие", value: "280" },
                    { label: "Ограничение на время жизни", value: "394" },
                    { label: "Одержимость", value: "544" },
                    { label: "Один родитель", value: "651" },
                    { label: "Одинокий главный герой", value: "399" },
                    { label: "Одиночество", value: "398" },
                    { label: "Одно тело на двоих", value: "634" },
                    { label: "Око силы", value: "253" },
                    { label: "Оммёдзи", value: "498" },
                    { label: "Организованная преступность", value: "500" },
                    { label: "Оргия", value: "501" },
                    { label: "Орки", value: "499" },
                    { label: "Основано на аниме", value: "74" },
                    { label: "Основано на видеоигре", value: "72" },
                    { label: "Основано на визуальной новелле", value: "73" },
                    { label: "Основано на песне", value: "70" },
                    { label: "Основано на фильме", value: "69" },
                    { label: "Осторожный главный герой", value: "117" },
                    { label: "От ненависти до любви один шаг", value: "239" },
                    { label: "От сильного с сильнейшему", value: "684" },
                    { label: "От слабого к сильному", value: "752" },
                    { label: "Отаку", value: "503" },
                    { label: "Отзывчивая любовь", value: "380" },
                    { label: "Отзывчивый главный герой", value: "339" },
                    { label: "Отношение учитель-ученик", value: "430" },
                    { label: "Отношения бог-человек", value: "315" },
                    { label: "Отношения между учителем и учеником", value: "687" },
                    { label: "Отношения начальник-подчинённый", value: "101" },
                    { label: "Отношения против воли", value: "286" },
                    { label: "Отношения с нечеловеком", value: "353" },
                    { label: "Отношения сэмпай-кохай", value: "621" },
                    { label: "Отношения хозяин-слуга", value: "431" },
                    { label: "Отомэ-игры", value: "504" },
                    { label: "ОТП", value: "562" },
                    { label: "Отшельники", value: "505" },
                    { label: "Офисный работник", value: "600" },
                    { label: "Официанты", value: "748" },
                    { label: "Охотники", value: "355" },
                    { label: "Падшие ангелы", value: "255" },
                    { label: "Падшие дворяне", value: "256" },
                    { label: "Пайзури", value: "511" },
                    { label: "Паразиты", value: "513" },
                    { label: "Параллельные миры", value: "512" },
                    { label: "Парк развлечений", value: "32" },
                    { label: "Пародия", value: "515" },
                    { label: "Перемещение между мирами", value: "758" },
                    { label: "Переодевание", value: "167" },
                    { label: "Переплавка пилюль", value: "529" },
                    { label: "Перерождение в девушку", value: "420" },
                    { label: "Перерождение в другом мире", value: "580" },
                    { label: "Перерождение в другом мире", value: "720" },
                    { label: "Перерождение в игровом мире", value: "579" },
                    { label: "Перерождение в монстра", value: "577" },
                    { label: "Персонажи с мазохистскими наклонностями", value: "429" },
                    { label: "Персонажи с садистскими наклонностями", value: "598" },
                    { label: "Петля времени", value: "709" },
                    { label: "Петтинг", value: "328" },
                    { label: "Писатели", value: "761" },
                    { label: "Питомцы", value: "522" },
                    { label: "Племенное общество", value: "726" },
                    { label: "Повелитель демонов", value: "191" },
                    { label: "Повествование от нескольких лиц", value: "459" },
                    { label: "Поглощение навыков", value: "653" },
                    { label: "Подземелья", value: "223" },
                    { label: "Поздно начинающаяся романтическая линия", value: "387" },
                    { label: "Политика", value: "538" },
                    { label: "Полулюди", value: "190" },
                    { label: "Помолвка", value: "240" },
                    { label: "Попаданец в другой мир", value: "723" },
                    { label: "Попаданец в игровой мир", value: "722" },
                    { label: "Постапокалипсис", value: "546" },
                    { label: "Постижение Дао", value: "181" },
                    { label: "Потеря девственности", value: "282" },
                    { label: "Потустороннее пространство", value: "416" },
                    { label: "Похищения", value: "379" },
                    { label: "Прагматичный главный герой", value: "549" },
                    { label: "Предательство", value: "83" },
                    { label: "Предвидение", value: "550" },
                    { label: "Преследователи", value: "674" },
                    { label: "Преступление", value: "165" },
                    { label: "Преступность", value: "166" },
                    { label: "Приёмные дети", value: "19" },
                    { label: "Призванный герой", value: "693" },
                    { label: "Призраки", value: "309" },
                    { label: "Приключения", value: "22" },
                    { label: "Принуждение", value: "108" },
                    { label: "Приручатель", value: "453" },
                    { label: "Прислуга", value: "625" },
                    { label: "Приставучий любовник", value: "136" },
                    { label: "Притворная любовь", value: "552" },
                    { label: "Пришельцы", value: "28" },
                    { label: "Программист", value: "558" },
                    { label: "Произведение - обладатель наград", value: "66" },
                    { label: "Проклятия", value: "175" },
                    { label: "Промывка мозгов", value: "102" },
                    { label: "Пропуск времени", value: "712" },
                    { label: "Пророчества", value: "559" },
                    { label: "Протагонист в очках", value: "312" },
                    { label: "Протагонист раб", value: "657" },
                    { label: "Психокинез", value: "565" },
                    { label: "Психопаты", value: "566" },
                    { label: "Путешествия", value: "759" },
                    { label: "Путешествия во времени", value: "713" },
                    { label: "Пытки", value: "716" },
                    { label: "Рабы", value: "658" },
                    { label: "Развитие отношений", value: "160" },
                    { label: "Развитие персонажа", value: "119" },
                    { label: "Раздвоение личности", value: "458" },
                    { label: "Размеренная романтика", value: "661" },
                    { label: "Разница в статусе", value: "201" },
                    { label: "Разорванная помолвка", value: "104" },
                    { label: "Разумные предметы", value: "622" },
                    { label: "Рай", value: "336" },
                    { label: "Раняя романтика", value: "227" },
                    { label: "Расизм", value: "573" },
                    { label: "Расследования", value: "372" },
                    { label: "Ребенок — главный герой", value: "126" },
                    { label: "Реверс-гарем", value: "589" },
                    { label: "Реверс-изнасилование", value: "590" },
                    { label: "Резкая смена характера", value: "520" },
                    { label: "Реинкарнация", value: "581" },
                    { label: "Религии", value: "582" },
                    { label: "Ресторан", value: "585" },
                    { label: "Решительный главный герой", value: "199" },
                    { label: "Робкий протагонист", value: "714" },
                    { label: "Родительсткий комплекс", value: "514" },
                    { label: "Родные не связанные кровью", value: "647" },
                    { label: "Родословные", value: "94" },
                    { label: "РПГ-система", value: "392" },
                    { label: "Рыцари", value: "383" },
                    { label: "Самовлюбленный главный герой", value: "477" },
                    { label: "Самоубийства", value: "692" },
                    { label: "Самураи", value: "601" },
                    { label: "Сборник коротких историй", value: "144" },
                    { label: "Свадьба", value: "426" },
                    { label: "Связанные сюжетные линии", value: "369" },
                    { label: "Святые", value: "599" },
                    { label: "Секреты", value: "614" },
                    { label: "Секс втроём", value: "707" },
                    { label: "Секс-рабыня", value: "629" },
                    { label: "Семейная любовь", value: "257" },
                    { label: "Семь добродетелей", value: "627" },
                    { label: "Семь смертных грехов", value: "626" },
                    { label: "Серийные убийцы", value: "624" },
                    { label: "Сикигами", value: "637" },
                    { label: "Сильная любовь от старших", value: "214" },
                    { label: "Синдром восьмиклассника", value: "132" },
                    { label: "Синдром сестры", value: "652" },
                    { label: "Сироты", value: "502" },
                    { label: "Системный администратор", value: "699" },
                    { label: "Скромный главный герой", value: "409" },
                    { label: "Скрытые романтические отношения", value: "23" },
                    { label: "Скрытые способности", value: "343" },
                    { label: "Скряга", value: "450" },
                    { label: "Скульпторы", value: "606" },
                    { label: "Слабая романтика", value: "688" },
                    { label: "Слабый главный герой", value: "751" },
                    { label: "Сложные семейные отношения", value: "149" },
                    { label: "Смена расы", value: "572" },
                    { label: "Смертельное заболевание", value: "704" },
                    { label: "Смерть", value: "185" },
                    { label: "Смерть любимых", value: "186" },
                    { label: "Современность", value: "448" },
                    { label: "Современные знания в слаборазвитых мирах", value: "449" },
                    { label: "Сожительство", value: "141" },
                    { label: "Создание артефактов", value: "57" },
                    { label: "Создание клана", value: "133" },
                    { label: "Создание королевства", value: "381" },
                    { label: "Создание навыков", value: "655" },
                    { label: "Сокрытие истинных способностей", value: "344" },
                    { label: "Сокрытие личности", value: "345" },
                    { label: "Солдаты", value: "664" },
                    { label: "Сон", value: "659" },
                    { label: "Соседи по комнате", value: "595" },
                    { label: "Социальные изгои", value: "663" },
                    { label: "Спасение мира", value: "602" },
                    { label: "Спорящая пара", value: "84" },
                    { label: "Способность перевоплощения", value: "719" },
                    { label: "Средневековье", value: "436" },
                    { label: "Стеснительные персонажи", value: "643" },
                    { label: "Стокгольмский синдром", value: "575" },
                    { label: "Стокгольмский синдром", value: "675" },
                    { label: "Стратег", value: "681" },
                    { label: "Стратегические битвы", value: "680" },
                    { label: "Стрелки", value: "325" },
                    { label: "Стрельба из лука", value: "50" },
                    { label: "Студенческий совет", value: "686" },
                    { label: "Судьба", value: "197" },
                    { label: "Суккубы", value: "689" },
                    { label: "Суперспособности", value: "669" },
                    { label: "Суровая тренировка", value: "332" },
                    { label: "Сцены насилия", value: "195" },
                    { label: "Таинственное прошлое", value: "472" },
                    { label: "Тайная личность", value: "610" },
                    { label: "Тайные организации", value: "611" },
                    { label: "Телохранители", value: "98" },
                    { label: "Тентакли", value: "703" },
                    { label: "Террористы", value: "705" },
                    { label: "Технологический разрыв", value: "702" },
                    { label: "Тихие герои", value: "568" },
                    { label: "Толстый протагонист", value: "271" },
                    { label: "Торговцы", value: "438" },
                    { label: "Травник", value: "340" },
                    { label: "Трагичное прошлое", value: "718" },
                    { label: "Трап", value: "725" },
                    { label: "Триллер", value: "708" },
                    { label: "Турнир", value: "76" },
                    { label: "Тюрьма", value: "556" },
                    { label: "Убийства", value: "465" },
                    { label: "Уверенный в себе главный герой", value: "151" },
                    { label: "Умная пара", value: "662" },
                    { label: "Умный главный герой", value: "135" },
                    { label: "Уникальная техника культивации", value: "735" },
                    { label: "Уникальные оружия", value: "737" },
                    { label: "Управление бизнесом", value: "109" },
                    { label: "Управление временем", value: "710" },
                    { label: "Управление пространством", value: "667" },
                    { label: "Ускоренный рост", value: "6" },
                    { label: "Учёные", value: "605" },
                    { label: "Учителя", value: "700" },
                    { label: "Фамильяры", value: "258" },
                    { label: "Фанатизм", value: "264" },
                    { label: "Фармацевт", value: "523" },
                    { label: "Феи", value: "254" },
                    { label: "Фениксы", value: "526" },
                    { label: "Фетиш на грудь", value: "103" },
                    { label: "Фетиш на очки", value: "311" },
                    { label: "Философия", value: "524" },
                    { label: "Фобии/Страхи", value: "525" },
                    { label: "Фольклор", value: "285" },
                    { label: "Формирование армии", value: "54" },
                    { label: "Футанари", value: "295" },
                    { label: "Футуристический мир", value: "296" },
                    { label: "Фэнтези", value: "267" },
                    { label: "Фэнтезийные существа", value: "266" },
                    { label: "Хакеры", value: "326" },
                    { label: "Харизматичный протагонист", value: "120" },
                    { label: "Хитрый главный герой", value: "173" },
                    { label: "Хладнокровный главный герой", value: "112" },
                    { label: "Художники", value: "60" },
                    { label: "Хулиганы", value: "188" },
                    { label: "Цундере", value: "728" },
                    { label: "Чат", value: "122" },
                    { label: "Человек-оружие", value: "352" },
                    { label: "Человекоподобный главный герой", value: "354" },
                    { label: "Честный главный герой", value: "348" },
                    { label: "Четкие любовные убеждения", value: "683" },
                    { label: "Читы", value: "123" },
                    { label: "Чудаковатые герои", value: "569" },
                    { label: "Чужие воспоминания", value: "721" },
                    { label: "Шантаж", value: "89" },
                    { label: "Шеф-повар", value: "124" },
                    { label: "Школа для девочек", value: "29" },
                    { label: "Шоу-бизнес", value: "642" },
                    { label: "Шпионы", value: "670" },
                    { label: "Эволюция", value: "250" },
                    { label: "Эгоистичный главный герой", value: "618" },
                    { label: "Экзорцизм", value: "252" },
                    { label: "Экономика", value: "230" },
                    { label: "Эксгибиционизм", value: "251" },
                    { label: "Эксперименты на людях", value: "351" },
                    { label: "Элементальная магия", value: "234" },
                    { label: "Элементы игрового мира", value: "299" },
                    { label: "Элементы романтики", value: "594" },
                    { label: "Элементы юри", value: "640" },
                    { label: "Элементы яоя", value: "641" },
                    { label: "Эльфы", value: "235" },
                    { label: "Эпизодичность", value: "243" },
                    { label: "Язвительные персонажи", value: "635" },
                    { label: "Языковой барьер", value: "386" },
                    { label: "Яндере", value: "762" },
                    { label: "Яойщица", value: "294" },
                    { label: "Японские силы самообороны", value: "378" },
                    { label: "R-15", value: "570" },
                    { label: "R-18", value: "571" },
                ],
                type: filterInputs_1.FilterTypes.CheckboxGroup,
            },
            genres: {
                label: "Жанры",
                value: [],
                options: [
                    { label: "16+", value: "1" },
                    { label: "18+", value: "2" },
                    { label: "Боевик", value: "3" },
                    { label: "Боевые искусства", value: "4" },
                    { label: "Вампиры", value: "47" },
                    { label: "Военное", value: "44" },
                    { label: "Гарем", value: "5" },
                    { label: "Демоны", value: "48" },
                    { label: "Детектив", value: "6" },
                    { label: "Дзёсей", value: "50" },
                    { label: "Драма", value: "7" },
                    { label: "Игры", value: "45" },
                    { label: "Историческое", value: "8" },
                    { label: "Киберпанк", value: "9" },
                    { label: "Комедия", value: "10" },
                    { label: "Космос", value: "46" },
                    { label: "Магия", value: "42" },
                    { label: "Махо-сёдзё", value: "12" },
                    { label: "Меха", value: "13" },
                    { label: "Мистика", value: "14" },
                    { label: "Музыка", value: "49" },
                    { label: "Научная фантастика", value: "15" },
                    { label: "Пародия", value: "16" },
                    { label: "Повседневность", value: "17" },
                    { label: "Приключения", value: "18" },
                    { label: "Психологическое", value: "19" },
                    { label: "Романтика", value: "20" },
                    { label: "Сверхъестественное", value: "21" },
                    { label: "Сёдзё", value: "22" },
                    { label: "Сёдзё-ай", value: "23" },
                    { label: "Сёнэн", value: "24" },
                    { label: "Сёнэн-ай", value: "25" },
                    { label: "Смена пола", value: "26" },
                    { label: "Современность", value: "27" },
                    { label: "Спорт", value: "28" },
                    { label: "Супер сила", value: "43" },
                    { label: "Сэйнэн", value: "29" },
                    { label: "Трагедия", value: "32" },
                    { label: "Триллер", value: "33" },
                    { label: "Ужасы", value: "34" },
                    { label: "Уся", value: "35" },
                    { label: "Фэнтези", value: "36" },
                    { label: "Школьная жизнь", value: "37" },
                    { label: "Этти", value: "38" },
                    { label: "Юри", value: "39" },
                    { label: "Яой", value: "40" },
                    { label: "LitRPG", value: "41" },
                ],
                type: filterInputs_1.FilterTypes.CheckboxGroup,
            },
        };
    }
    TL.prototype.popularNovels = function (page, _a) {
        var _b, _c, _d, _e, _f;
        var showLatestNovels = _a.showLatestNovels, filters = _a.filters;
        return __awaiter(this, void 0, void 0, function () {
            var result, json, novels;
            var _this = this;
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(this.site + "/api/site/v2/graphql", {
                            method: "post",
                            headers: {
                                Accept: "application/json, text/plain, */*",
                                "Accept-Language": "ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3",
                                "Content-Type": "application/json",
                            },
                            referrer: this.site,
                            body: JSON.stringify({
                                operationName: "Projects",
                                query: "query Projects($hostname:String! $filter:SearchFilter $page:Int $limit:Int){projects(section:{fullUrl:$hostname}filter:$filter page:{pageSize:$limit,pageNumber:$page}){content{title fullUrl covers{url}}}}",
                                variables: {
                                    filter: {
                                        tags: ((_b = filters === null || filters === void 0 ? void 0 : filters.tags) === null || _b === void 0 ? void 0 : _b.value) || [],
                                        genres: ((_c = filters === null || filters === void 0 ? void 0 : filters.genres) === null || _c === void 0 ? void 0 : _c.value) || [],
                                    },
                                    hostname: "novel.tl",
                                    limit: 40,
                                    page: page,
                                },
                            }),
                        })];
                    case 1:
                        result = _g.sent();
                        return [4 /*yield*/, result.json()];
                    case 2:
                        json = (_g.sent());
                        novels = [];
                        (_f = (_e = (_d = json.data) === null || _d === void 0 ? void 0 : _d.projects) === null || _e === void 0 ? void 0 : _e.content) === null || _f === void 0 ? void 0 : _f.forEach(function (novel) {
                            var _a, _b;
                            return novels.push({
                                name: novel.title,
                                url: "https://" + novel.fullUrl,
                                cover: ((_b = (_a = novel === null || novel === void 0 ? void 0 : novel.covers) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.url)
                                    ? _this.site + novel.covers[0].url
                                    : defaultCover_1.defaultCover,
                            });
                        });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    TL.prototype.parseNovelAndChapters = function (novelUrl) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
        return __awaiter(this, void 0, void 0, function () {
            var result, json, novel, genres, chapters;
            return __generator(this, function (_q) {
                switch (_q.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(this.site + "/api/site/v2/graphql", {
                            method: "post",
                            headers: {
                                Accept: "application/json, text/plain, */*",
                                "Accept-Language": "ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3",
                                "Content-Type": "application/json",
                            },
                            referrer: this.site,
                            body: JSON.stringify({
                                operationName: "Book",
                                query: 'query Book($url:String){project(project:{fullUrl:$url}){title translationStatus fullUrl covers{url}persons(langs:["ru","en","*"],roles:["author","illustrator"]){role name{firstName lastName}}genres{nameRu nameEng}tags{nameRu nameEng}annotation{text}subprojects{content{title volumes{content{shortName chapters{title publishDate fullUrl published}}}}}}}',
                                variables: {
                                    url: novelUrl,
                                },
                            }),
                        })];
                    case 1:
                        result = _q.sent();
                        return [4 /*yield*/, result.json()];
                    case 2:
                        json = (_q.sent());
                        novel = {
                            url: novelUrl,
                            name: (_a = json.data.project) === null || _a === void 0 ? void 0 : _a.title,
                            cover: ((_d = (_c = (_b = json.data.project) === null || _b === void 0 ? void 0 : _b.covers) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.url)
                                ? this.site + json.data.project.covers[0].url
                                : defaultCover_1.defaultCover,
                            summary: (_f = (_e = json.data.project) === null || _e === void 0 ? void 0 : _e.annotation) === null || _f === void 0 ? void 0 : _f.text,
                            status: ((_g = json.data.project) === null || _g === void 0 ? void 0 : _g.translationStatus) === "active"
                                ? novelStatus_1.NovelStatus.Ongoing
                                : novelStatus_1.NovelStatus.Completed,
                        };
                        genres = [(_h = json.data.project) === null || _h === void 0 ? void 0 : _h.tags, (_j = json.data.project) === null || _j === void 0 ? void 0 : _j.genres]
                            .flat()
                            .map(function (item) { return (item === null || item === void 0 ? void 0 : item.nameRu) || (item === null || item === void 0 ? void 0 : item.nameEng); })
                            .filter(function (item) { return item; });
                        if (genres === null || genres === void 0 ? void 0 : genres.length) {
                            novel.genres = genres.join(", ");
                        }
                        (_l = (_k = json.data.project) === null || _k === void 0 ? void 0 : _k.persons) === null || _l === void 0 ? void 0 : _l.forEach(function (person) {
                            var _a;
                            if (person.role == "author" && person.name.firstName) {
                                novel.author =
                                    person.name.firstName + " " + (((_a = person.name) === null || _a === void 0 ? void 0 : _a.lastName) || "");
                            }
                        });
                        chapters = [];
                        (_p = (_o = (_m = json.data.project) === null || _m === void 0 ? void 0 : _m.subprojects) === null || _o === void 0 ? void 0 : _o.content) === null || _p === void 0 ? void 0 : _p.forEach(function (work) {
                            return work.volumes.content.forEach(function (volume) {
                                return volume.chapters.forEach(function (chapter) {
                                    return (chapter === null || chapter === void 0 ? void 0 : chapter.published) &&
                                        chapters.push({
                                            name: volume.shortName + " " + chapter.title,
                                            url: "https://" + chapter.fullUrl,
                                            releaseTime: (0, dayjs_1.default)(chapter.publishDate).format("LLL"),
                                        });
                                });
                            });
                        });
                        novel.chapters = chapters;
                        return [2 /*return*/, novel];
                }
            });
        });
    };
    TL.prototype.parseChapter = function (chapterUrl) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function () {
            var result, json, baseUrl, loadedCheerio, chapterText;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(this.site + "/api/site/v2/graphql", {
                            method: "post",
                            headers: {
                                Accept: "application/json, text/plain, */*",
                                "Accept-Language": "ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3",
                                "Content-Type": "application/json",
                            },
                            referrer: this.site,
                            body: JSON.stringify({
                                query: "query($url:String){chapter(chapter:{fullUrl:$url}){text{text}}}",
                                variables: {
                                    url: chapterUrl,
                                },
                            }),
                        })];
                    case 1:
                        result = _c.sent();
                        return [4 /*yield*/, result.json()];
                    case 2:
                        json = (_c.sent());
                        baseUrl = this.site;
                        loadedCheerio = (0, cheerio_1.load)(((_b = (_a = json.data.chapter) === null || _a === void 0 ? void 0 : _a.text) === null || _b === void 0 ? void 0 : _b.text) || "");
                        loadedCheerio("p > a[href]").each(function () {
                            var src = baseUrl + loadedCheerio(this).attr("href");
                            if (!src.startsWith("http")) {
                                src = baseUrl + src;
                            }
                            loadedCheerio(this).find("picture").remove();
                            loadedCheerio(this).removeAttr("href");
                            loadedCheerio("<img src=\"".concat(src, "\">")).appendTo(this);
                        });
                        chapterText = loadedCheerio.html();
                        return [2 /*return*/, chapterText];
                }
            });
        });
    };
    TL.prototype.searchNovels = function (searchTerm, page) {
        var _a, _b, _c;
        if (page === void 0) { page = 1; }
        return __awaiter(this, void 0, void 0, function () {
            var result, json, novels;
            var _this = this;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(this.site + "/api/site/v2/graphql", {
                            method: "post",
                            headers: {
                                Accept: "application/json, text/plain, */*",
                                "Accept-Language": "ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3",
                                "Content-Type": "application/json",
                            },
                            referrer: this.site,
                            body: JSON.stringify({
                                operationName: "Projects",
                                query: "query Projects($hostname:String! $filter:SearchFilter $page:Int $limit:Int){projects(section:{fullUrl:$hostname}filter:$filter page:{pageSize:$limit,pageNumber:$page}){content{title fullUrl covers{url}}}}",
                                variables: {
                                    filter: {
                                        query: searchTerm,
                                    },
                                    hostname: "novel.tl",
                                    limit: 40,
                                    page: page,
                                },
                            }),
                        })];
                    case 1:
                        result = _d.sent();
                        return [4 /*yield*/, result.json()];
                    case 2:
                        json = (_d.sent());
                        novels = [];
                        (_c = (_b = (_a = json === null || json === void 0 ? void 0 : json.data) === null || _a === void 0 ? void 0 : _a.projects) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.forEach(function (novel) {
                            var _a, _b;
                            return novels.push({
                                name: novel.title,
                                url: "https://" + novel.fullUrl,
                                cover: ((_b = (_a = novel === null || novel === void 0 ? void 0 : novel.covers) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.url)
                                    ? _this.site + novel.covers[0].url
                                    : defaultCover_1.defaultCover,
                            });
                        });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    return TL;
}());
exports.default = new TL();
