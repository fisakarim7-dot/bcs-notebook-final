import { db } from "@/lib/db";

interface SeedNode {
  name: string;
  type: "folder" | "note";
  note?: { content?: string; completed?: boolean; font?: "kalpurush" | "times" };
  children?: SeedNode[];
}

const SEED: SeedNode[] = [
  {
    name: "বাংলা (Bangla)",
    type: "folder",
    children: [
      {
        name: "লিখিত অংশ (Written)",
        type: "folder",
        children: [
          {
            name: "সাহিত্য (Literature)",
            type: "folder",
            children: [
              {
                name: "প্রাচীন ও মধ্যযুগ",
                type: "folder",
                children: [
                  {
                    name: "চর্যাপদ",
                    type: "folder",
                    children: [
                      {
                        name: "চর্যাপদ: ভাষা ও কালনির্ণয়",
                        type: "note",
                        note: {
                          completed: true,
                          content:
                            '<h2>চর্যাপদ — ভাষা ও কালনির্ণয়</h2><p>চর্যাপদ বাংলা ভাষার <mark data-color="#fde68a">প্রাচীনতম নিদর্শন</mark>। ১৯০৭ সালে নেপালের রাজদরবারের গ্রন্থাগার থেকে এটি আবিষ্কৃত হয়।</p><ul><li><strong>আবিষ্কারক:</strong> হরপ্রসাদ শাস্ত্রী (১৯১৬ সালে প্রকাশ)</li><li><strong>পদ সংখ্যা:</strong> ৪৭টি, কবি সংখ্যা ২৪ জন</li><li><strong>ভাষা:</strong> সন্ধ্যা ভাষা (আঞ্চলিক রূপভেদ)</li><li><strong>কালনির্ণয়:</strong> আনুমানিক ৮ম–১২তম শতাব্দী</li></ul><blockquote>সন্ধ্যা ভাষার ব্যাখ্যায় সন্দেহাতীতভাবে বাংলা ভাষার স্বরূপ ধরা যায়।</blockquote>',
                        },
                      },
                    ],
                  },
                  {
                    name: "মঙ্গলকাব্য",
                    type: "folder",
                    children: [
                      {
                        name: "মঙ্গলকাব্যের ধারা ও বৈশিষ্ট্য",
                        type: "note",
                        note: {
                          content:
                            '<h2>মঙ্গলকাব্যের ধারা</h2><p>মঙ্গলকাব্য মধ্যযুগের একটি কাব্যধারা যেখানে দেবী-দেবতার মাহাত্ম্য বর্ণিত হয়।</p><ol><li><strong>মনসা মঙ্গল</strong> — কেতকাদাস ক্ষেমানন্দ, বিপ্রদাস পিপাই</li><li><strong>চণ্ডী মঙ্গল</strong> — মুকুন্দরাম চক্রবর্তী</li><li><strong>ধর্মমঙ্গল</strong> — ময়ূরভট্ট</li></ol>',
                        },
                      },
                    ],
                  },
                ],
              },
              {
                name: "আধুনিক যুগ",
                type: "folder",
                children: [
                  {
                    name: "রবীন্দ্রনাথ ঠাকুর",
                    type: "folder",
                    children: [
                      {
                        name: "গীতাঞ্জলি: মূলভাব ও রস",
                        type: "note",
                        note: {
                          completed: true,
                          content:
                            '<h2>গীতাঞ্জলি</h2><p>গীতাঞ্জলি (গানের উদ্দেশ্যে উচ্চারিত) — রবীন্দ্রনাথের <mark data-color="#bbf7d0">দেবভজনামূলক</mark> কাব্যগ্রন্থ।</p><ul><li>ইংরেজি অনুবাদ: <em>Song Offerings</em> (১৯১২)</li><li>নোবেল পুরস্কার: ১৯১৩ (গীতাঞ্জলি-র ইংরেজি সংস্করণের জন্য)</li><li>মূলভাব: মানব-ঈশ্বরের ঐক্য, আত্মোন্নতি ও বিনম্রতা</li></ul>',
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "English (ইংরেজি)",
    type: "folder",
    children: [
      {
        name: "Written Part",
        type: "folder",
        children: [
          {
            name: "Grammar",
            type: "folder",
            children: [
              {
                name: "Tense & Sequence",
                type: "folder",
                children: [
                  {
                    name: "Present Tense — Rules & Uses",
                    type: "note",
                    font: "times",
                    note: {
                      completed: true,
                      content:
                        '<h2>Present Tense — Rules &amp; Uses</h2><p>The present tense describes <mark data-color="#bbf7d0">current actions, habits and universal truths</mark>.</p><table><tr><th>Form</th><th>Use</th><th>Example</th></tr><tr><td>Simple</td><td>Habit / fact</td><td>He writes daily.</td></tr><tr><td>Continuous</td><td>Ongoing action</td><td>He is writing now.</td></tr><tr><td>Perfect</td><td>Recent relevance</td><td>He has written it.</td></tr><tr><td>Perfect Cont.</td><td>Duration till now</td><td>He has been writing for an hour.</td></tr></table><p><strong>Tip:</strong> Adverbs like <em>usually, always, never</em> signal simple present.</p>',
                    },
                  },
                ],
              },
            ],
          },
          {
            name: "Composition",
            type: "folder",
            children: [
              {
                name: "Paragraph Writing",
                type: "folder",
                children: [
                  {
                    name: "Structure of a Good Paragraph",
                    type: "note",
                    font: "times",
                    note: {
                      content:
                        '<h2>Paragraph Structure</h2><p>A well-built paragraph has <mark data-color="#fde68a">three movement parts</mark>:</p><ul><li><strong>Topic sentence</strong> — the controlling idea</li><li><strong>Supporting sentences</strong> — evidence, examples, data</li><li><strong>Concluding sentence</strong> — restates or concludes</li></ul><blockquote>Unity + Coherence + Emphasis = a strong paragraph.</blockquote>',
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "বাংলাদেশ বিষয়াবলি",
    type: "folder",
    children: [
      {
        name: "ইতিহাস (History)",
        type: "folder",
        children: [
          {
            name: "মুক্তিযুদ্ধ ১৯৭১",
            type: "folder",
            children: [
              {
                name: "প্রেক্ষাপট (Background)",
                type: "folder",
                children: [
                  {
                    name: "ভাষা আন্দোলন থেকে ছয় দফা",
                    type: "note",
                    note: {
                      completed: true,
                      content:
                        '<h2>ভাষা আন্দোলন থেকে ছয় দফা</h2><p>১৯৪৮–৫২ সালের ভাষা আন্দোলন বাঙালির <mark data-color="#fde68a">স্বাধিকার চেতনার</mark> প্রথম বড় উত্থান।</p><ul><li>২১ ফেব্রুয়ারি ১৯৫২ — শহিদ দিবস (ইউনেস্কো স্বীকৃতি ১৯৯৯)</li><li>১৯৫৪ যুক্তফ্রন্ট নির্বাচন → ১৯৬৬ <strong>ছয় দফা</strong> (স্বাধীনতার সনদ)</li><li>আগরতলা ষড়যন্ত্র মামলা ১৯৬৮ → গণঅভ্যুত্থান ১৯৬৯</li></ul>',
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        name: "রাষ্ট্র ও প্রশাসন",
        type: "folder",
        children: [
          {
            name: "সংবিধান (Constitution)",
            type: "folder",
            children: [
              {
                name: "মৌলিক নীতিমালা",
                type: "folder",
                children: [
                  {
                    name: "সংবিধানের চার মৌলিক নীতি",
                    type: "note",
                    note: {
                      content:
                        '<h2>সংবিধানের চার মৌলিক নীতি</h2><p>১৯৭২ সালের সংবিধানের অনুচ্ছেদ ৮ অনুযায়ী:</p><ol><li>বাংলাদেশের <mark data-color="#bbf7d0">জাতীয়তাবাদ</mark></li><li>সমাজতন্ত্র</li><li>গণতন্ত্র</li><li>ধর্মনিরপেক্ষতা</li></ol><p>সংশোধনী: পঞ্চম (ধর্মভিত্তিকতা), সপ্তম (রাষ্ট্রপতি শাসন বাতিল), পঞ্চদশ (১৫ সংশোধনী — ধর্মনিরপেক্ষতা পুনঃপ্রতিষ্ঠা)।</p>',
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "আন্তর্জাতিক বিষয়াবলি",
    type: "folder",
    children: [
      {
        name: "জাতিসংঘ (United Nations)",
        type: "folder",
        children: [
          {
            name: "প্রতিষ্ঠা ও অঙ্গসংগঠন",
            type: "folder",
            children: [
              {
                name: "নিরাপত্তা পরিষদ: কাঠামো ও ভেটো",
                type: "note",
                note: {
                  content:
                    '<h2>UN Security Council</h2><p>প্রতিষ্ঠা: ২৪ অক্টোবর ১৯৪৫। নিরাপত্তা পরিষদের সদস্য <mark data-color="#fde68a">১৫টি</mark>:</p><ul><li><strong>স্থায়ী (P5):</strong> যুক্তরাষ্ট্র, যুক্তরাজ্য, ফ্রান্স, রাশিয়া, চীন — ভেটো ক্ষমতা</li><li><strong>অস্থায়ী:</strong> ১০টি, ২ বছর মেয়াদ</li><li>বাংলাদেশ ৩ বার অস্থায়ী সদস্য (১৯৭৯-৮০, ২০০০-০১, ২০২২-২৩)</li></ul>',
                },
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "ভূগোল ও পরিবেশ",
    type: "folder",
    children: [
      {
        name: "ভূগোল (Geography)",
        type: "folder",
        children: [
          {
            name: "বাংলাদেশের নদী ও ভূপ্রকৃতি",
            type: "folder",
            children: [
              {
                name: "পদ্মা-মেঘনা-যমুনা ব্যবস্থা",
                type: "note",
                note: {
                  content:
                    '<h2>পদ্মা-মেঘনা-যমুনা</h2><p>বাংলাদেশের তিনটি প্রধান নদীব্যবস্থা গাঙ্গেয় ব-দ্বীপ গঠন করেছে।</p><ul><li><strong>পদ্মা:</strong> গঙ্গার বাংলাদেশ শাখা, দৈর্ঘ্য ~১২০ কি.মি. (দেশের ভেতরে)</li><li><strong>যমুনা:</strong> ব্রহ্মপুত্রের শাখা (সবচেয়ে প্রশস্ত)</li><li><strong>মেঘনা:</strong> সুরমা-কুশিয়ারার মিলনে গঠিত</li></ul><p>দীর্ঘতম নদী: <strong>কর্ণফুলী</strong> নয় — দেশের দীর্ঘতম নদী <mark data-color="#bbf7d0">যমুনা (সম্পূর্ণ প্রবাহ অনুযায়ী)</mark>; বহির্ভূত গঙ্গা-ব্রহ্মপুত্র ধরলে পদ্মা সর্বাধিক।</p>',
                },
              },
            ],
          },
        ],
      },
      {
        name: "দুর্যোগ ব্যবস্থাপনা",
        type: "folder",
        children: [
          {
            name: "দুর্যোগের প্রকারভেদ",
            type: "folder",
            children: [
              {
                name: "প্রাকৃতিক ও জনসৃজিত দুর্যোগ",
                type: "note",
                note: {
                  content:
                    '<h2>দুর্যোগের শ্রেণিবিভাগ</h2><p><strong>প্রাকৃতিক:</strong> বন্যা, ঘূর্ণিঝড়, ভূমিকম্প, খরা, নদীভাঙন</p><p><strong>জনসৃজিত:</strong> অগ্নিকাণ্ড, রাসায়নিক দুর্ঘটনা, যুদ্ধ</p><ul><li>দুর্যোগ ব্যবস্থাপনার ৪ পর্যায়: <mark data-color="#fde68a">প্রস্তুতি → প্রতিকার → ত্রাণ → পুনর্বাসন</mark></li><li>CPP প্রতিষ্ঠা: ১৯৭২ (সাইক্লোন প্রস্তুতি কর্মসূচি)</li></ul>',
                },
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "মানসিক দক্ষতা ও গণিত",
    type: "folder",
    children: [
      {
        name: "গণিত (Mathematics)",
        type: "folder",
        children: [
          {
            name: "শতকরা (Percentage)",
            type: "folder",
            children: [
              {
                name: "মৌলিক ধারণা ও শর্টকাট",
                type: "note",
                note: {
                  completed: true,
                  content:
                    '<h2>শতকরা — মৌলিক ধারণা</h2><p>x% of N = N × x/100</p><ul><li>আয়তন বৃদ্ধি: N × (1 + x/100)</li><li>ক্রমিক বৃদ্ধি a% ও b%: কার্যকর = a + b + ab/100</li><li>ঘর বাড়ি হারে হ্রাস পেলে মূল = পরিবর্তিত × 100/(100 − x)</li></ul><p><strong>শর্টকাট:</strong> ১২.৫% = ১/৮, ৮৩ ১/৩% = ৫/৬ — ভগ্নাংশ রূপান্তর মুখস্থ রাখো।</p>',
                },
              },
            ],
          },
        ],
      },
      {
        name: "মানসিক দক্ষতা (Mental Ability)",
        type: "folder",
        children: [
          {
            name: "সংখ্যা সিরিজ",
            type: "folder",
            children: [
              {
                name: "সিরিজ সমাধানের কৌশল",
                type: "note",
                note: {
                  content:
                    '<h2>সিরিজ সমাধানের কৌশল</h2><ol><li>পার্থক্য পরীক্ষা (d = ধ্রুব বা বর্ধনশীল)</li><li>অনুপাত পরীক্ষা (গুণোত্তর হলে r ধ্রুব)</li><li>বর্গ/ঘন সংখ্যার নিকটতম মান লক্ষ্য করো</li><li>দুই-ধাপ প্যাটার্ন: ×২ +১, ×৩ −২ ইত্যাদি</li></ol><p>উদাহরণ: ২, ৬, ১২, ২০, ৩০, <mark data-color="#bbf7d0">৪২</mark> (পার্থক্য ৪, ৬, ৮, ১০, ১২)</p>',
                },
              },
            ],
          },
        ],
      },
    ],
  },
];

export async function seedIfEmpty(): Promise<boolean> {
  const count = await db.treeNode.count();
  if (count > 0) return false;

  async function createNodes(items: SeedNode[], parentId: string | null, order: number) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const node = await db.treeNode.create({
        data: {
          name: item.name,
          type: item.type,
          parentId,
          order: order + i,
        },
      });
      if (item.type === "note") {
        await db.note.create({
          data: {
            nodeId: node.id,
            content: item.note?.content ?? "",
            font: item.note?.font ?? "kalpurush",
            completed: item.note?.completed ?? false,
          },
        });
      }
      if (item.children?.length) {
        await createNodes(item.children, node.id, 0);
      }
    }
  }

  await createNodes(SEED, null, 0);
  return true;
}
