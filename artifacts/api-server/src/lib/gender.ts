/**
 * Simple gender detection based on first name heuristics.
 * Returns: male, female, mostly_male, mostly_female, andy (androgynous), unknown
 */

const MALE_NAMES = new Set([
  "james","john","robert","michael","william","david","richard","joseph","thomas","charles",
  "christopher","daniel","matthew","anthony","mark","donald","steven","paul","andrew","joshua",
  "kenneth","kevin","brian","george","timothy","ronald","edward","jason","jeffrey","ryan",
  "jacob","gary","nicholas","eric","jonathan","stephen","larry","justin","scott","brandon",
  "benjamin","samuel","raymond","gregory","frank","alexander","patrick","jack","dennis","jerry",
  "ali","mehmet","mustafa","ahmet","hasan","huseyin","ibrahim","ismail","yusuf","omer",
  "emre","mert","can","cem","berk","burak","furkan","serkan","osman","adem","adnan",
  "baris","bahadir","berkay","bilal","bulent","cagatay","caner","cemal","cenk","cengiz",
  "deniz","emir","erhan","erkan","fatih","ferhat","gokhan","goksel","halil","hamza",
  "ilker","kadir","kamil","kemal","koray","levent","lutfi","mahmut","musa","nuri",
  "oguz","onur","orhan","ozkan","polat","rauf","recep","rifat","selim","semih",
  "serhat","serkan","sinan","soner","tahir","tarkan","tayfun","tuncay","ugur","umut",
  "volkan","yalcin","yasin","yavuz","yigit","yuksel","zafer","zeki",
  "luca","marco","paolo","giovanni","antonio","mario","franco","roberto","sergio","luigi",
  "pedro","carlos","juan","miguel","jose","antonio","francisco","manuel","rafael","pablo",
  "hans","fritz","dieter","gerhard","horst","manfred","werner","helmut","günter","rolf",
  "pierre","jean","michel","paul","andre","philippe","olivier","nicolas","laurent","xavier",
  "ivan","dmitri","sergei","aleksei","nikolai","andrei","vladimir","viktor","mikhail","boris",
  "ahmed","omar","hassan","hussein","khalid","tariq","walid","samir","nasser","farid",
  "wei","lei","hao","yang","ming","feng","jun","cheng","tao","peng",
  "raj","rahul","rohit","amit","suresh","vijay","arun","arjun","krishna","ravi",
  "noah","liam","oliver","elijah","aiden","lucas","mason","ethan","logan","jackson",
  "kai","ryu","kenta","takeshi","hiroshi","kenji","satoshi","yuto","haruki","ren",
  "aryan","zaid","omar","yassine","karim","ayoub","hamza","bilal","amine","younes",
]);

const FEMALE_NAMES = new Set([
  "mary","patricia","jennifer","linda","barbara","elizabeth","susan","jessica","sarah","karen",
  "lisa","nancy","betty","margaret","sandra","ashley","dorothy","kimberly","emily","donna",
  "michelle","carol","amanda","melissa","deborah","stephanie","rebecca","sharon","laura","cynthia",
  "kathleen","amy","angela","shirley","anna","brenda","pamela","emma","nicole","helen",
  "samantha","katherine","christine","debra","rachel","carolyn","janet","catherine","maria","heather",
  "ayse","fatma","zeynep","emine","hatice","elif","esra","busra","seda","gul",
  "neslihan","ozlem","pinar","serap","sibel","tugce","yildiz","zeliha","aysun","bahar",
  "berrak","beyza","canan","damla","duygu","ebru","ece","filiz","gulsen","hande",
  "ilkay","irem","ipek","kubra","merve","meryem","miray","nazan","nilay","nur",
  "nurgul","ozge","pelin","rabia","reyhan","rukiye","selin","selma","sevgi","seyma",
  "tugba","ulku","umay","yasemen","yeliz","yesim","yildiz","zuhal","zuleyha","dilnoza",
  "sofia","giulia","chiara","valentina","alessia","federica","eleonora","martina","francesca","sara",
  "isabella","luna","mia","camila","valeria","maria","sofia","luciana","gabriela","andrea",
  "anna","hanna","maria","sarah","lea","katharina","julia","lena","jana","lisa",
  "sophie","alice","claire","julie","marie","camille","pauline","emma","eva","manon",
  "natalya","tatyana","olga","elena","irina","svetlana","larisa","nadia","marina","vera",
  "fatima","layla","aisha","zainab","nour","rania","lina","amina","sara","maryam",
  "li","fang","yan","ling","jing","min","xiu","hui","qing","yun",
  "priya","divya","anita","sunita","kavita","rekha","geeta","seema","neha","pooja",
  "olivia","ava","isla","mia","poppy","sophia","lily","amelia","grace","ella",
  "yuki","haruka","sakura","nanami","aoi","riko","miyu","rin","hina","nana",
  "lina","leila","yasmine","amira","nadia","rima","hana","dana","aya","sana",
]);

const FEMALE_ENDINGS = ["a", "ia", "ina", "ita", "elle", "ette", "ine", "ise", "ise", "ie"];
const MALE_ENDINGS = ["os", "us", "io", "ko", "ro", "no", "to"];

export type Gender = "male" | "female" | "mostly_male" | "mostly_female" | "andy" | "unknown";

export function detectGender(firstName: string): Gender {
  if (!firstName || firstName.length < 2) return "unknown";

  const name = firstName.toLowerCase().trim();

  if (FEMALE_NAMES.has(name)) return "female";
  if (MALE_NAMES.has(name)) return "male";

  // Check endings
  const hasFemaleEnding = FEMALE_ENDINGS.some((e) => name.endsWith(e));
  const hasMaleEnding = MALE_ENDINGS.some((e) => name.endsWith(e));

  if (hasFemaleEnding && !hasMaleEnding) return "mostly_female";
  if (hasMaleEnding && !hasFemaleEnding) return "mostly_male";

  return "andy";
}
