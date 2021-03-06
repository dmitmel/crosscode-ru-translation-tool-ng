import {
  ChapterStatus,
  Fragment,
  NotaClient,
  Original,
  Translation,
  generateFragmentDescriptionText,
  getChapterNameOfFile,
  stringifyFragmentOriginal,
  stringifyFragmentTranslation,
} from './Notabenoid.js';
import { NwNotaHttpClient } from './Notabenoid/nw.js';
import { IGNORE_IN_MOD_TAG, INJECTED_IN_MOD_TAG, LocalizeMePacker } from './TranslationPack.js';
import { readSettings, writeSettings } from './settings.js';
import {
  CHAPTER_FRAGMENTS_DIR,
  CHAPTER_STATUSES_FILE,
  CROSSLOCALE_SCAN_DB_FILE,
  LOCALIZE_ME_MAPPING_FILE,
  LOCALIZE_ME_PACKS_DIR,
  MIGRATION_LOOKUP_TABLE_FILE,
  MOD_DATA_DIR,
} from './paths.js';
import { ScanDb } from './crosslocale/scan.js';

import fs from './node-builtin-modules/fs.js';
import * as fsUtils from './utils/fs.js';
import paths from './node-builtin-modules/path.js';
import subprocess from './node-builtin-modules/child_process.js';

import * as asyncUtils from './utils/async.js';
import * as iteratorUtils from './utils/iterator.js';
import * as miscUtils from './utils/misc.js';
import * as urlUtils from './utils/url.js';

declare global {
  var app: Main; // eslint-disable-line no-var
}

window.addEventListener('load', () => {
  let app = new Main();
  window.app = app;
  void app.start();
});

const COMMON_PHRASES = new Map([
  ['???', '???'],
  ['????', '????'],
  ['...', '...'],
  ['.\\..\\..', '.\\..\\..'],
  ['...!', '...!'],
  ['...!!', '...!!'],
  ['...?', '...?'],
  ['...?!', '...?!'],
  ['...!?', '...!?'],
  ['[nods]', '[кивает]'],
  ['[shakes head]', '[мотает головой]'],
  ['Hi!', 'Привет!'],
  ['Hi?', 'Привет?'],
  ['Hi.', 'Привет.'],
  ['Hi...', 'Привет...'],
  ['Hi!!', 'Привет!!'],
  ['Hi!!!', 'Привет!!!'],
  ['Why?', 'Почему?'],
  ['How?', 'Как?'],
  ['Bye!', 'Пока!'],
  ['Bye.', 'Пока.'],
  ['Bye?', 'Пока?'],
  ['Thanks!', 'Спасибо!'],
  ['Lea!', 'Лея!'],
  ['[yes]', '[да]'],
  ['[no]', '[нет]'],
  ['Up', 'Наверх'],
  ['Down', 'Вниз'],
  ['Meet', 'Встреча'],
  ['Yes', 'Да'],
  ['No', 'Нет'],
  ['Logout', 'Выход из игры'],
  ['Login', 'Инициализация'],
  ['What?', 'Что?'],
  ['Who?', 'Кто?'],
  ['Where?', 'Где?'],
]);

const IGNORED_LABELS = new Set<string>([
  '',
  'en_US',
  'LOL, DO NOT TRANSLATE THIS!',
  'LOL, DO NOT TRANSLATE THIS! (hologram)',
  '\\c[1][DO NOT TRANSLATE THE FOLLOWING]\\c[0]',
  '\\c[1][DO NOT TRANSLATE FOLLOWING TEXTS]\\c[0]',
]);

class Main {
  public notaClient = new NotaClient(new NwNotaHttpClient());
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  public progressBar = new ProgressBar();
  public useScanDb = false;

  public async start(): Promise<void> {
    try {
      await fs.promises.mkdir(MOD_DATA_DIR, { recursive: true });

      let settings = await readSettings();
      this.notaClient.useNotabridge = settings.useNotabridge;
      this.useScanDb = settings.useScanDb;

      let autoOpenCheckbox = document.getElementById(
        'settings_translations_autoOpen',
      )! as HTMLInputElement;
      autoOpenCheckbox.disabled = false;
      autoOpenCheckbox.checked = settings.autoOpen;
      autoOpenCheckbox.addEventListener('change', () => {
        settings.autoOpen = autoOpenCheckbox.checked;
        void writeSettings(settings);
      });

      let useNotabridgeCheckbox = document.getElementById(
        'settings_translations_useNotabridge',
      )! as HTMLInputElement;
      useNotabridgeCheckbox.disabled = false;
      useNotabridgeCheckbox.checked = settings.useNotabridge;
      useNotabridgeCheckbox.addEventListener('change', () => {
        settings.useNotabridge = useNotabridgeCheckbox.checked;
        this.notaClient.useNotabridge = settings.useNotabridge;
        void writeSettings(settings);
      });

      let useScanDbCheckbox = document.getElementById(
        'settings_translations_useScanDb',
      )! as HTMLInputElement;
      useScanDbCheckbox.disabled = false;
      useScanDbCheckbox.checked = settings.useScanDb;
      useScanDbCheckbox.addEventListener('change', () => {
        settings.useScanDb = useScanDbCheckbox.checked;
        this.useScanDb = settings.useScanDb;
        void writeSettings(settings);
      });

      await showDevTools();

      let updateButton = document.getElementById(
        'settings_translations_update',
      )! as HTMLButtonElement;
      updateButton.disabled = false;
      updateButton.addEventListener('click', () => {
        void this.downloadTranslations(false);
      });

      let redownloadButton = document.getElementById(
        'settings_translations_redownload',
      )! as HTMLButtonElement;
      redownloadButton.disabled = false;
      redownloadButton.addEventListener('click', () => {
        void this.downloadTranslations(true);
      });
    } catch (err) {
      console.error(err);
    }
  }

  public async autoTranslateCommonPhrases(): Promise<void> {
    let chapterStatuses: Map<string, ChapterStatus> = await this.readChapterStatuses();
    let chapterFragments = new Map<string, Fragment[]>();
    let allChapterFragmentsCount = 0;
    for (let [i, name] of iteratorUtils.enumerate(chapterStatuses.keys())) {
      this.progressBar.setTaskInfo(`Чтение главы '${name}' с диска...`);
      this.progressBar.setValue(i, chapterStatuses.size);

      let fragments: Fragment[] = await fsUtils.readJsonFile(
        paths.join(CHAPTER_FRAGMENTS_DIR, `${name}.json`),
      );
      chapterFragments.set(name, fragments);
      allChapterFragmentsCount += fragments.length;
    }
    this.progressBar.setDone();

    const autoTranslate = async (f: Fragment): Promise<void> => {
      if (f.translations.length > 0) return;

      let translation = COMMON_PHRASES.get(f.original.text);
      if (translation == null) return;

      console.warn(`${f.original.file} ${f.original.jsonPath}: common phrase`);
      await this.notaClient.addFragmentTranslation(f.chapterId, f.id, translation);
    };

    let fixedFragmentsCount = 0;
    for (let chapterStatus of chapterStatuses.values()) {
      this.progressBar.setTaskInfo(chapterStatus.name);
      let fragments = chapterFragments.get(chapterStatus.name)!;

      for (let fragment of fragments) {
        this.progressBar.setValue(fixedFragmentsCount, allChapterFragmentsCount);
        await autoTranslate(fragment);
        fixedFragmentsCount++;
      }
    }
    this.progressBar.setTaskInfo('');
    this.progressBar.setDone();
  }

  public async fixFragmentOriginals(wdiff = false): Promise<void> {
    let chapterStatuses: Map<string, ChapterStatus> = await this.readChapterStatuses();
    let chapterFragments = new Map<string, Fragment[]>();
    let allChapterFragmentsCount = 0;
    for (let [i, name] of iteratorUtils.enumerate(chapterStatuses.keys())) {
      this.progressBar.setTaskInfo(`Чтение главы '${name}' с диска...`);
      this.progressBar.setValue(i, chapterStatuses.size);

      let fragments: Fragment[] = await fsUtils.readJsonFile(
        paths.join(CHAPTER_FRAGMENTS_DIR, `${name}.json`),
      );
      chapterFragments.set(name, fragments);
      allChapterFragmentsCount += fragments.length;
    }
    this.progressBar.setDone();

    let scanDb: ScanDb | null = null;
    if (this.useScanDb) {
      this.progressBar.setTaskInfo('Чтение базы данных сканирования CrossLocalE...');
      this.progressBar.setIndeterminate();
      scanDb = ScanDb.fromJSON(await fsUtils.readJsonFile(CROSSLOCALE_SCAN_DB_FILE));
    }

    let assetsCache = new Map<string, Promise<unknown>>();
    const fixOriginal = async (f: Fragment): Promise<void> => {
      if (f.original.descriptionText.includes(IGNORE_IN_MOD_TAG)) {
        return;
      }

      let { file: filePath, jsonPath: jsonPathStr } = f.original;
      let realOriginalText: string | null = null;

      if (scanDb != null) {
        let gameFile = scanDb.gameFiles.get(filePath);
        if (gameFile == null) {
          console.warn(`${filePath} ${jsonPathStr}: unknown file`);
          await this.notaClient.addFragmentTranslation(
            f.chapterId,
            f.id,
            'tr_ru:ERR_REMOVED_FROM_GAME',
          );
          return;
        }

        let fragment = gameFile.fragments.get(jsonPathStr);
        if (fragment != null) {
          f.original.file = fragment.file.path;
          f.original.jsonPath = fragment.jsonPath;
          f.original.langUid = fragment.langUid;
          f.original.descriptionText = fragment.description.join('\n');
          realOriginalText = fragment.text.get('en_US')!;
        }
      } else {
        if (f.original.descriptionText.includes(INJECTED_IN_MOD_TAG)) {
          return;
        }

        let promise: Promise<unknown>;
        if (assetsCache.has(filePath)) {
          promise = assetsCache.get(filePath)!;
        } else {
          promise = fsUtils.readJsonFileOptional(paths.join('assets', filePath));
          assetsCache.set(filePath, promise);
        }

        let fileData = await promise;
        if (fileData == null) {
          console.warn(`${filePath} ${jsonPathStr}: unknown file`);
          await this.notaClient.addFragmentTranslation(
            f.chapterId,
            f.id,
            'tr_ru:ERR_REMOVED_FROM_GAME',
          );
          return;
        }
        let isLangFile = filePath.endsWith('.en_US.json');

        let jsonPath = jsonPathStr.split('/');
        let obj = miscUtils.getValueByPath(fileData, jsonPath);
        if (obj != null) {
          f.original.descriptionText = !isLangFile
            ? generateFragmentDescriptionText(jsonPath, fileData)
            : '';
        }

        if (isLangFile) {
          if (typeof obj === 'string') realOriginalText = obj;
        } else if (
          miscUtils.isObject(obj) &&
          miscUtils.hasKey(obj, 'en_US') &&
          typeof obj.en_US === 'string'
        ) {
          realOriginalText = obj.en_US;
        }
      }

      if (realOriginalText == null) {
        console.warn(`${filePath} ${jsonPathStr}: not a string`);
        await this.notaClient.addFragmentTranslation(
          f.chapterId,
          f.id,
          'tr_ru:ERR_REMOVED_FROM_GAME',
        );
        return;
      }

      if (f.original.text !== realOriginalText) {
        console.warn(`${filePath} ${jsonPathStr}: stale original`);
        const TMP_PATH_PREFIX = '/tmp/crosscode-ru-translation-tool-';
        const OLD_FILE_PATH = `${TMP_PATH_PREFIX}old`;
        const NEW_FILE_PATH = `${TMP_PATH_PREFIX}new`;
        fs.writeFileSync(OLD_FILE_PATH, f.original.text);
        fs.writeFileSync(NEW_FILE_PATH, realOriginalText);
        let diffStr = f.original.text;
        if (wdiff) {
          try {
            subprocess.execFileSync('wdiff', [OLD_FILE_PATH, NEW_FILE_PATH], { encoding: 'utf8' });
          } catch (err: unknown) {
            if (
              miscUtils.isObject(err) &&
              miscUtils.hasKey(err, 'stdout') &&
              typeof err.stdout === 'string'
            ) {
              diffStr = err.stdout;
            }
          }
        }
        await this.notaClient.addFragmentTranslation(
          f.chapterId,
          f.id,
          `tr_ru:ERR_STALE_ORIGINAL\n\n${diffStr}`,
        );
      }
      f.original.text = realOriginalText;

      let newRawText = stringifyFragmentOriginal(f.original);
      if (newRawText !== f.original.rawContent) {
        await this.notaClient.editFragmentOriginal(f.chapterId, f.id, f.orderNumber, newRawText);
      }
    };

    let fixedFragmentsCount = 0;

    for (let chapterStatus of chapterStatuses.values()) {
      this.progressBar.setTaskInfo(chapterStatus.name);
      let fragments = chapterFragments.get(chapterStatus.name)!;

      let iterator = function* (this: Main) {
        for (let fragment of fragments) {
          this.progressBar.setValue(fixedFragmentsCount, allChapterFragmentsCount);
          yield fixOriginal(fragment);
          fixedFragmentsCount++;
        }
      }.call(this);

      await asyncUtils.limitConcurrency(iterator, 16);
    }

    this.progressBar.setTaskInfo('');
    this.progressBar.setDone();
  }

  public async uploadNewFragments(): Promise<void> {
    let chapterStatuses: Map<string, ChapterStatus> = await this.readChapterStatuses();
    let chapterFragments = new Map<string, Fragment[]>();
    // arrays are used as pointers for the sake of updating max order numbers
    // by reference instead of performing a lookup in `Map#set` every time
    let chapterMaxOrderNumbers = new Map<string, [number]>();
    for (let [i, name] of iteratorUtils.enumerate(chapterStatuses.keys())) {
      this.progressBar.setTaskInfo(`Чтение главы '${name}' с диска...`);
      this.progressBar.setValue(i, chapterStatuses.size);

      let fragments: Fragment[] = await fsUtils.readJsonFile(
        paths.join(CHAPTER_FRAGMENTS_DIR, `${name}.json`),
      );
      chapterFragments.set(name, fragments);

      let maxOrderNum = 0;
      for (let f of fragments) {
        maxOrderNum = Math.max(maxOrderNum, f.orderNumber);
      }
      chapterMaxOrderNumbers.set(name, [maxOrderNum]);
    }
    this.progressBar.setDone();

    let scanDb: ScanDb | null = null;
    if (this.useScanDb) {
      this.progressBar.setTaskInfo('Чтение базы данных сканирования CrossLocalE...');
      this.progressBar.setIndeterminate();
      scanDb = ScanDb.fromJSON(await fsUtils.readJsonFile(CROSSLOCALE_SCAN_DB_FILE));
    }

    let filePaths: string[] = [];
    if (scanDb != null) {
      filePaths = Array.from(scanDb.gameFiles.keys());
    } else {
      this.progressBar.setIndeterminate();
      this.progressBar.setTaskInfo(`Поиск файлов...`);
      for (let jsonDir of ['data', 'extension']) {
        for await (let path of fsUtils.findFilesRecursively(paths.join('assets', jsonDir))) {
          if (path.endsWith('.json')) {
            filePaths.push(paths.join(jsonDir, path));
            this.progressBar.setTaskInfo(`Найдено файлов: ${filePaths.length}`);
          }
        }
      }
      filePaths.sort();
      this.progressBar.setDone();
    }

    for (let [i, filePath] of filePaths.entries()) {
      this.progressBar.setTaskInfo(filePath);
      this.progressBar.setValue(i, filePaths.length);

      let isLangFile = filePath.startsWith(paths.normalize('data/lang/'));
      if (isLangFile && !filePath.endsWith('.en_US.json')) continue;

      let langLabelIterable: Iterable<LocalizableStringData>;
      let data: unknown = null;
      if (scanDb != null) {
        langLabelIterable = iteratorUtils.map(
          scanDb.gameFiles.get(filePath)!.fragments.values(),
          (fragment) => ({
            jsonPath: fragment.jsonPath.split('/'),
            langUid: fragment.langUid,
            description: fragment.description,
            text: fragment.text.get('en_US')!,
          }),
        );
      } else {
        data = await fsUtils.readJsonFile(paths.join('assets', filePath));
        langLabelIterable = findLangLabelsInFile(isLangFile, data);
      }

      let chapterName = getChapterNameOfFile(filePath);
      let chapterId = chapterStatuses.get(chapterName)!.id;
      let thisChapterFragments = chapterFragments.get(chapterName)!;
      let chapterMaxOrderNumber = chapterMaxOrderNumbers.get(chapterName)!;

      for (let langLabel of langLabelIterable) {
        if (isLangLabelIgnored(langLabel, filePath)) continue;

        let jsonPathStr = langLabel.jsonPath.join('/');
        if (
          thisChapterFragments.some(
            ({ original: o }) => o.file === filePath && o.jsonPath === jsonPathStr,
          )
        ) {
          continue;
        }

        let orig: Original = {
          rawContent: '',
          file: filePath,
          jsonPath: jsonPathStr,
          langUid: langLabel.langUid,
          descriptionText:
            langLabel.description?.join('\n') ??
            (!isLangFile ? generateFragmentDescriptionText(langLabel.jsonPath, data) : ''),
          text: langLabel.text,
        };
        orig.rawContent = stringifyFragmentOriginal(orig);

        chapterMaxOrderNumber[0]++;
        console.warn(`${filePath} ${jsonPathStr}: new fragment`);
        console.log(chapterName, orig.rawContent);
        await this.notaClient.addFragmentOriginal(
          chapterId,
          chapterMaxOrderNumber[0],
          orig.rawContent,
        );
      }
    }
    this.progressBar.setDone();

    this.progressBar.setTaskInfo('');
  }

  public async fixFragmentOrder(): Promise<void> {
    let chapterStatuses: Map<string, ChapterStatus> = await this.readChapterStatuses();
    let chapterFragments = new Map<string, Array<Fragment & { prevOrderNumber?: number }>>();
    // arrays are used as pointers for the sake of updating max order numbers
    // by reference instead of performing a lookup in `Map#set` every time
    let chapterMaxOrderNumbers = new Map<string, [number]>();
    for (let [i, name] of iteratorUtils.enumerate(chapterStatuses.keys())) {
      this.progressBar.setTaskInfo(`Чтение главы '${name}' с диска...`);
      this.progressBar.setValue(i, chapterStatuses.size);

      let fragments: Array<Fragment & { prevOrderNumber?: number }> = await fsUtils.readJsonFile(
        paths.join(CHAPTER_FRAGMENTS_DIR, `${name}.json`),
      );
      chapterFragments.set(
        name,
        fragments.map((f) => {
          f.prevOrderNumber = f.orderNumber;
          return f;
        }),
      );
      chapterMaxOrderNumbers.set(name, [1]);
    }
    this.progressBar.setDone();

    let scanDb: ScanDb | null = null;
    if (this.useScanDb) {
      this.progressBar.setTaskInfo('Чтение базы данных сканирования CrossLocalE...');
      this.progressBar.setIndeterminate();
      scanDb = ScanDb.fromJSON(await fsUtils.readJsonFile(CROSSLOCALE_SCAN_DB_FILE));
    }

    let filePaths: string[] = [];
    if (scanDb != null) {
      filePaths = Array.from(scanDb.gameFiles.keys());
    } else {
      this.progressBar.setIndeterminate();
      this.progressBar.setTaskInfo(`Поиск файлов...`);
      for (let jsonDir of ['data', 'extension']) {
        for await (let path of fsUtils.findFilesRecursively(paths.join('assets', jsonDir))) {
          if (path.endsWith('.json')) {
            filePaths.push(paths.join(jsonDir, path));
            this.progressBar.setTaskInfo(`Найдено файлов: ${filePaths.length}`);
          }
        }
      }
      filePaths.sort();
      this.progressBar.setDone();
    }

    for (let [i, filePath] of filePaths.entries()) {
      this.progressBar.setTaskInfo(filePath);
      this.progressBar.setValue(i, filePaths.length);

      let isLangFile = filePath.startsWith(paths.normalize('data/lang/'));
      if (isLangFile && !filePath.endsWith('.en_US.json')) continue;

      let langLabelIterable: Iterable<LocalizableStringData>;
      let data: unknown = null;
      if (scanDb != null) {
        langLabelIterable = iteratorUtils.map(
          scanDb.gameFiles.get(filePath)!.fragments.values(),
          (fragment) => ({
            jsonPath: fragment.jsonPath.split('/'),
            langUid: fragment.langUid,
            description: fragment.description,
            text: fragment.text.get('en_US')!,
          }),
        );
      } else {
        data = await fsUtils.readJsonFile(paths.join('assets', filePath));
        langLabelIterable = findLangLabelsInFile(isLangFile, data);
      }

      let chapterName = getChapterNameOfFile(filePath);
      let thisChapterFragments = chapterFragments.get(chapterName)!;
      let chapterMaxOrderNumber = chapterMaxOrderNumbers.get(chapterName)!;

      for (let langLabel of langLabelIterable) {
        if (isLangLabelIgnored(langLabel, filePath)) continue;

        let jsonPathStr = langLabel.jsonPath.join('/');
        let fragment = thisChapterFragments.find(
          ({ original: o }) => o.file === filePath && o.jsonPath === jsonPathStr,
        );
        if (fragment == null) {
          throw new Error(`${filePath} ${jsonPathStr}: unknown fragment`);
        }
        fragment.orderNumber = chapterMaxOrderNumber[0];
        chapterMaxOrderNumber[0] += 1;
      }
    }
    this.progressBar.setDone();

    let fragmentsNeedingFix = new Map<string, Array<Fragment & { prevOrderNumber?: number }>>();
    let fragmentsNeedingFixCount = 0;

    for (let chapterStatus of chapterStatuses.values()) {
      let chapterName = chapterStatus.name;
      let fragments = chapterFragments.get(chapterName)!;
      let fragments2 = miscUtils.mapGetOrInsert(fragmentsNeedingFix, chapterName, []);

      fragments.sort((f1, f2) => f1.orderNumber - f2.orderNumber);

      for (let f of fragments) {
        if (f.orderNumber !== f.prevOrderNumber) {
          fragments2.push(f);
          fragmentsNeedingFixCount++;
        }
      }
    }

    let fixedFragmentsCount = 0;
    for (let [chapterName, fragments] of fragmentsNeedingFix) {
      this.progressBar.setTaskInfo(chapterName);

      for (let f of fragments) {
        this.progressBar.setValue(fixedFragmentsCount, fragmentsNeedingFixCount);
        console.log(`${chapterName}: ${f.original.file} ${f.original.jsonPath} ${f.orderNumber}`);
        await this.notaClient.editFragmentOriginal(
          f.chapterId,
          f.id,
          f.orderNumber,
          f.original.rawContent,
        );
        fixedFragmentsCount++;
      }
    }
    this.progressBar.setDone();

    this.progressBar.setTaskInfo('');
  }

  public async compileMigrationLookupTable(): Promise<void> {
    let chapterStatuses: Map<string, ChapterStatus> = await this.readChapterStatuses();
    let lookupTable = new Map<string, Set<string>>();
    for (let [i, name] of iteratorUtils.enumerate(chapterStatuses.keys())) {
      this.progressBar.setTaskInfo(`Чтение главы '${name}' с диска...`);
      this.progressBar.setValue(i, chapterStatuses.size);

      let fragments: Fragment[] = await fsUtils.readJsonFile(
        paths.join(CHAPTER_FRAGMENTS_DIR, `${name}.json`),
      );

      for (let f of fragments) {
        if (f.translations.length > 0) {
          let lookupResult = lookupTable.get(f.original.text);
          if (lookupResult == null) {
            lookupResult = new Set();
            lookupTable.set(f.original.text, lookupResult);
          }
          for (let t of f.translations) {
            // rawText usage is intended
            lookupResult.add(t.rawText);
          }
        }
      }
    }
    this.progressBar.setDone();

    this.progressBar.setTaskInfo('Запись миграционной таблицы...');
    this.progressBar.setIndeterminate();

    await fsUtils.writeJsonFile(MIGRATION_LOOKUP_TABLE_FILE, lookupTable, (_k, v) => {
      if (v instanceof Set) {
        return Array.from(v);
      } else if (v instanceof Map) {
        return miscUtils.mapToObject(v);
      } else {
        return v;
      }
    });

    this.progressBar.setTaskInfo('');
    this.progressBar.setDone();
  }

  public async performExperimentalMigrations(dangerousLutMode = false): Promise<void> {
    let chapterStatuses: Map<string, ChapterStatus> = await this.readChapterStatuses();
    let chapterFragments = new Map<string, Fragment[]>();
    let allChapterFragmentsCount = 0;
    for (let [i, name] of iteratorUtils.enumerate(chapterStatuses.keys())) {
      this.progressBar.setTaskInfo(`Чтение главы '${name}' с диска...`);
      this.progressBar.setValue(i, chapterStatuses.size);

      let fragments: Fragment[] = await fsUtils.readJsonFile(
        paths.join(CHAPTER_FRAGMENTS_DIR, `${name}.json`),
      );
      chapterFragments.set(name, fragments);
      allChapterFragmentsCount += fragments.length;
    }
    this.progressBar.setDone();

    this.progressBar.setTaskInfo('Чтение миграционной таблицы...');
    this.progressBar.setIndeterminate();
    let lookupTable = dangerousLutMode
      ? miscUtils.objectToMap<string, string[]>(
          await fsUtils.readJsonFile(MIGRATION_LOOKUP_TABLE_FILE),
        )
      : null;
    this.progressBar.setDone();

    const migrateFragment = async (f: Fragment): Promise<void> => {
      let translations: Translation[] = [];
      let errors: Translation[] = [];
      for (let t of f.translations) {
        (t.text.startsWith('tr_ru:ERR') ? errors : translations).push(t);
      }
      if (errors.length === 0) return;

      if (errors.length > 1) {
        console.error(
          // what the heck has happened here?
          `${f.original.file} ${f.original.jsonPath}: multiple errors on a single fragment`,
        );
        return;
      }

      if (translations.length === 0) {
        // there is no value in this fragment, no need to keep it
        console.warn(
          `${f.original.file} ${f.original.jsonPath}: no translations, deleting fragment`,
        );
        await this.notaClient.deleteFragmentOriginal(f.chapterId, f.id);
        return;
      }

      if (translations.length > 1) {
        console.warn(
          `${f.original.file} ${f.original.jsonPath}: multiple translations, can't resolve such conflict`,
        );
        return;
      }

      if (errors[0].text.startsWith('tr_ru:ERR_REMOVED_FROM_GAME')) {
        //

        let commonTranslation = COMMON_PHRASES.get(f.original.text);
        if (commonTranslation != null && translations[0].text === commonTranslation) {
          console.warn(
            `${f.original.file} ${f.original.jsonPath}: common phrase, deleting fragment`,
          );
          await this.notaClient.deleteFragmentOriginal(f.chapterId, f.id);
          return;
        }

        let similarUntranslatedFragments: Fragment[] = [];
        let similarTranslatedFragments: Fragment[] = [];
        for (let fragmentsList of chapterFragments.values()) {
          for (let f2 of fragmentsList) {
            if (
              f2 !== f &&
              // NOTE: Various comparisons can be uncommented, but make sure to
              // review the logs before applying (cross-file) migrations.
              f2.original.file === f.original.file &&
              f2.original.langUid === f.original.langUid &&
              f2.original.descriptionText === f.original.descriptionText &&
              f2.original.text === f.original.text
            ) {
              if (f2.translations.length === 0) {
                similarUntranslatedFragments.push(f2);
              } else if (f2.translations.every((t) => t.text === translations[0].text)) {
                similarTranslatedFragments.push(f2);
              }
            }
          }
        }

        if (similarTranslatedFragments.length > 0) {
          console.warn(
            `${f.original.file} ${f.original.jsonPath}: fragment has already been translated elsewhere, deleting`,
          );
          await this.notaClient.deleteFragmentOriginal(f.chapterId, f.id);
          return;
        }

        if (similarUntranslatedFragments.length === 0) {
          console.error(
            `${f.original.file} ${f.original.jsonPath}: couldn't find a similar fragment, can't rename`,
          );
          return;
        } else if (similarUntranslatedFragments.length !== 1) {
          console.error(
            `${f.original.file} ${f.original.jsonPath}: multiple similar fragments found, can't migrate`,
          );
          return;
        }

        let f2 = similarUntranslatedFragments[0];
        console.warn(
          `${f.original.file} ${f.original.jsonPath}: migrating to ${f2.original.file} ${f2.original.jsonPath}`,
        );
        for (let t of translations) {
          await this.notaClient.addFragmentTranslation(
            f.chapterId,
            f2.id,
            stringifyFragmentTranslation(t),
          );
        }
        await this.notaClient.deleteFragmentOriginal(f.chapterId, f.id);

        return;

        //
      } else if (errors[0].text.startsWith('tr_ru:ERR_STALE_ORIGINAL')) {
        //

        if (dangerousLutMode) {
          let possibleTranslations = lookupTable!.get(f.original.text) ?? [];
          if (possibleTranslations.length > 1) {
            console.error(`${f.original.file} ${f.original.jsonPath}: ambiguous lookup results`);
            return;
          }

          if (possibleTranslations.length === 1) {
            console.warn(
              `${f.original.file} ${f.original.jsonPath}: found an exact match in the lookup table`,
            );
            await this.notaClient.addFragmentTranslation(
              f.chapterId,
              f.id,
              possibleTranslations[0],
            );
            for (let t of f.translations) {
              await this.notaClient.deleteFragmentTranslation(f.chapterId, f.id, t.id);
            }
            return;
          }
        }

        console.error(
          `${f.original.file} ${f.original.jsonPath}: can't handle stale originals for now`,
        );
        return;
      } else {
        console.error(`${f.original.file} ${f.original.jsonPath}: unknown error`);
        return;
      }

      console.error(`${f.original.file} ${f.original.jsonPath}: unable to migrate, generic error`);
    };

    let migratedFragmentsCount = 0;

    for (let chapterStatus of chapterStatuses.values()) {
      this.progressBar.setTaskInfo(chapterStatus.name);
      let fragments = chapterFragments.get(chapterStatus.name)!;

      let iterator = function* (this: Main) {
        for (let fragment of fragments) {
          this.progressBar.setValue(migratedFragmentsCount, allChapterFragmentsCount);
          yield migrateFragment(fragment);
          migratedFragmentsCount++;
        }
      }.call(this);

      await asyncUtils.limitConcurrency(iterator, 16);
    }

    this.progressBar.setTaskInfo('');
    this.progressBar.setDone();
  }

  // Part of the Extension Instrumentality Project.
  public async resplitChapters(): Promise<void> {
    let chapterStatuses: Map<string, ChapterStatus> = await this.readChapterStatuses();
    let chapterFragments = new Map<string, Fragment[]>();
    let allChapterFragmentsCount = 0;
    for (let [i, name] of iteratorUtils.enumerate(chapterStatuses.keys())) {
      this.progressBar.setTaskInfo(`Чтение главы '${name}' с диска...`);
      this.progressBar.setValue(i, chapterStatuses.size);

      let fragments: Fragment[] = await fsUtils.readJsonFile(
        paths.join(CHAPTER_FRAGMENTS_DIR, `${name}.json`),
      );
      chapterFragments.set(name, fragments);
      allChapterFragmentsCount += fragments.length;
    }
    this.progressBar.setDone();

    const moveFragment = async (f: Fragment): Promise<void> => {
      let newChapterName = getChapterNameOfFile(f.original.file);
      let newChapterStatus = chapterStatuses.get(newChapterName);
      if (newChapterStatus == null) {
        console.error(
          `${f.original.file} ${f.original.jsonPath}: Please create chapter '${newChapterName}'`,
        );
        return;
      }
      let newChapterId = newChapterStatus.id;
      if (newChapterId === f.chapterId) return;

      console.warn(
        `${f.original.file} ${f.original.jsonPath}: moving to chapter '${newChapterName}'`,
      );

      let newFragmentId = await this.notaClient.addFragmentOriginal(
        newChapterId,
        f.orderNumber,
        stringifyFragmentOriginal(f.original),
      );
      for (let t of f.translations) {
        await this.notaClient.addFragmentTranslation(
          newChapterId,
          newFragmentId,
          stringifyFragmentTranslation(t),
        );
      }
      await this.notaClient.deleteFragmentOriginal(f.chapterId, f.id);
    };

    let migratedFragmentsCount = 0;

    for (let chapterStatus of chapterStatuses.values()) {
      this.progressBar.setTaskInfo(chapterStatus.name);
      let fragments = chapterFragments.get(chapterStatus.name)!;

      let iterator = function* (this: Main) {
        for (let fragment of fragments) {
          this.progressBar.setValue(migratedFragmentsCount, allChapterFragmentsCount);
          yield moveFragment(fragment);
          migratedFragmentsCount++;
        }
      }.call(this);

      await asyncUtils.limitConcurrency(iterator, 16);
    }

    this.progressBar.setTaskInfo('');
    this.progressBar.setDone();
  }

  public async deleteIgnoredLangLabels(): Promise<void> {
    let chapterStatuses: Map<string, ChapterStatus> = await this.readChapterStatuses();
    let chapterFragments = new Map<string, Fragment[]>();
    let allChapterFragmentsCount = 0;
    for (let [i, name] of iteratorUtils.enumerate(chapterStatuses.keys())) {
      this.progressBar.setTaskInfo(`Чтение главы '${name}' с диска...`);
      this.progressBar.setValue(i, chapterStatuses.size);

      let fragments: Fragment[] = await fsUtils.readJsonFile(
        paths.join(CHAPTER_FRAGMENTS_DIR, `${name}.json`),
      );
      chapterFragments.set(name, fragments);
      allChapterFragmentsCount += fragments.length;
    }
    this.progressBar.setDone();

    const deleteFragment = async (f: Fragment): Promise<void> => {
      if (
        isLangLabelIgnored(
          {
            jsonPath: f.original.jsonPath.split('/'),
            langUid: f.original.langUid,
            text: f.original.text,
          },
          f.original.file,
        )
      ) {
        console.warn(`${f.original.file} ${f.original.jsonPath}: ignored, deleting`);
        await this.notaClient.deleteFragmentOriginal(f.chapterId, f.id);
      }
    };

    let migratedFragmentsCount = 0;

    for (let chapterStatus of chapterStatuses.values()) {
      this.progressBar.setTaskInfo(chapterStatus.name);
      let fragments = chapterFragments.get(chapterStatus.name)!;

      let iterator = function* (this: Main) {
        for (let fragment of fragments) {
          this.progressBar.setValue(migratedFragmentsCount, allChapterFragmentsCount);
          yield deleteFragment(fragment);
          migratedFragmentsCount++;
        }
      }.call(this);

      await asyncUtils.limitConcurrency(iterator, 16);
    }

    this.progressBar.setTaskInfo('');
    this.progressBar.setDone();
  }

  public async autoTranslateWithDangerousLut(): Promise<void> {
    let chapterStatuses: Map<string, ChapterStatus> = await this.readChapterStatuses();
    let chapterFragments = new Map<string, Fragment[]>();
    let allChapterFragmentsCount = 0;
    for (let [i, name] of iteratorUtils.enumerate(chapterStatuses.keys())) {
      this.progressBar.setTaskInfo(`Чтение главы '${name}' с диска...`);
      this.progressBar.setValue(i, chapterStatuses.size);

      let fragments: Fragment[] = await fsUtils.readJsonFile(
        paths.join(CHAPTER_FRAGMENTS_DIR, `${name}.json`),
      );
      chapterFragments.set(name, fragments);
      allChapterFragmentsCount += fragments.length;
    }
    this.progressBar.setDone();

    this.progressBar.setTaskInfo('Чтение lookup-таблицы...');
    this.progressBar.setIndeterminate();
    let lookupTable = miscUtils.objectToMap<string, string[]>(
      await fsUtils.readJsonFile(MIGRATION_LOOKUP_TABLE_FILE),
    );
    this.progressBar.setDone();

    const autoTranslate = async (f: Fragment): Promise<void> => {
      if (f.translations.length > 0) return;

      let translations = lookupTable.get(f.original.text);
      if (translations == null || translations.length !== 1) return;

      console.warn(`${f.original.file} ${f.original.jsonPath}: found in the LUT`);
      await this.notaClient.addFragmentTranslation(f.chapterId, f.id, translations[0]);
    };

    let fixedFragmentsCount = 0;
    for (let chapterStatus of chapterStatuses.values()) {
      this.progressBar.setTaskInfo(chapterStatus.name);
      let fragments = chapterFragments.get(chapterStatus.name)!;

      for (let fragment of fragments) {
        this.progressBar.setValue(fixedFragmentsCount, allChapterFragmentsCount);
        await autoTranslate(fragment);
        fixedFragmentsCount++;
      }
    }
    this.progressBar.setTaskInfo('');
    this.progressBar.setDone();
  }

  public async generatePO(translationLanguages: string[] = ['ru']): Promise<void> {
    let filePaths: string[] = [];
    console.log('Scanning JSON directories...');
    for (let jsonDir of ['data', 'extension']) {
      console.log(jsonDir);
      for await (let path of fsUtils.findFilesRecursively(paths.join('assets', jsonDir))) {
        if (path.endsWith('.json')) {
          filePaths.push(paths.join(jsonDir, path));
        }
      }
    }
    filePaths.sort();
    console.log('Found JSON files:', filePaths.length);

    console.log('Running preliminary scan...');
    let filePathsWithLangLabels: string[] = [];
    let totalLangLabelCount = 0;
    for (let [i, filePath] of filePaths.entries()) {
      console.log(`${i + 1}/${filePaths.length}`, filePath);

      let isLangFile = filePath.startsWith(paths.normalize('data/lang/'));
      if (isLangFile && !filePath.endsWith('.en_US.json')) continue;

      let data = await fsUtils.readJsonFile(paths.join('assets', filePath));
      let pushedThisFile = false;
      for (let _langLabel of findLangLabelsInFile(isLangFile, data)) {
        if (!pushedThisFile) {
          filePathsWithLangLabels.push(filePath);
          pushedThisFile = true;
        }
        totalLangLabelCount += 1;
      }
    }

    console.log('Files with lang labels:', filePathsWithLangLabels.length);
    console.log('Total lang label count:', totalLangLabelCount);

    for (let translationLanguage of translationLanguages) {
      // translationLanguage = 'es';
      // console.log('Loading the monolithic translation pack...');
      // let trPack = miscUtils.objectToMap(
      //   await fsUtils.readJsonFile(paths.join('CrossCode-Esp', 'translations.pack.json')),
      // );

      let chapterFileHandles = new Map<string, fs.promises.FileHandle>();

      console.log(`Generating PO files for language ${translationLanguage}...`);
      for (let [i, filePath] of filePathsWithLangLabels.entries()) {
        console.log(`${i + 1}/${filePathsWithLangLabels.length}`, filePath);

        let chapterName = getChapterNameOfFile(filePath);
        let poFileHandle = chapterFileHandles.get(chapterName);

        if (poFileHandle == null) {
          let poFilePath = paths.join(
            'crosscode-localization-data',
            'po',
            translationLanguage,
            'components',
            `${chapterName}.po`,
          );
          await fs.promises.mkdir(paths.dirname(poFilePath), {
            recursive: true,
          });
          poFileHandle = await fs.promises.open(poFilePath, 'w');
          chapterFileHandles.set(chapterName, poFileHandle);

          await poFileHandle.writeFile(
            [
              `msgid ""\n`,
              `msgstr ""\n`,
              `"Project-Id-Version: crosscode 0.0.0\\n"\n`,
              `"Report-Msgid-Bugs-To: \\n"\n`,
              `"POT-Creation-Date: \\n"\n`,
              `"PO-Revision-Date: \\n"\n`,
              `"Last-Translator: \\n"\n`,
              `"Language-Team: \\n"\n`,
              `"Language: ${translationLanguage}\\n"\n`,
              `"MIME-Version: 1.0\\n"\n`,
              `"Content-Type: text/plain; charset=UTF-8\\n"\n`,
              `"Content-Transfer-Encoding: 8bit\\n"\n`,
              `"Plural-Forms: \\n"\n`,
              `"X-Generator: crosscode-ru-translation-tool-ng 0.0.0\\n"\n`,
            ].join(''),
          );
        }

        let isLangFile = filePath.startsWith(paths.normalize('data/lang/'));
        if (isLangFile && !filePath.endsWith('.en_US.json')) continue;

        let data = await fsUtils.readJsonFile(paths.join('assets', filePath));

        for (let langLabel of findLangLabelsInFile(isLangFile, data)) {
          if (isLangLabelIgnored(langLabel, filePath)) continue;

          let jsonPathStr = langLabel.jsonPath.join('/');

          let orig: Original = {
            rawContent: '',
            file: filePath,
            jsonPath: jsonPathStr,
            langUid: langLabel.langUid,
            descriptionText: !isLangFile
              ? generateFragmentDescriptionText(langLabel.jsonPath, data)
              : '',
            text: langLabel.text,
          };
          orig.rawContent = stringifyFragmentOriginal(orig);

          // let localizeMeFilePath = filePath;
          // if (localizeMeFilePath.startsWith('data/')) {
          //   localizeMeFilePath = localizeMeFilePath.slice('data/'.length);
          // }
          // let translation = trPack.get(`${localizeMeFilePath}/${jsonPathStr}`);
          // if (translation != null && translation.orig !== langLabel.text) {
          //   throw new Error(
          //     `${filePath} ${jsonPathStr}: Outdated translation in the translation pack!`,
          //   );
          // }
          // let translationStr = translation != null ? translation.text : '';
          let translationStr = translationLanguage === 'en_US' ? orig.text : '';

          let locationText = `${orig.file} ${orig.jsonPath} #${orig.langUid ?? 0}`;
          let lines = [];
          lines.push(`\n`, `#. ${locationText}\n`);
          for (let line of orig.descriptionText.length > 0
            ? orig.descriptionText.split('\n')
            : []) {
            lines.push(`#. ${line}\n`);
          }
          lines.push(
            `#: ${urlUtils.encodeURIWeblate(locationText)}\n`,
            `msgctxt ${JSON.stringify(`${orig.file}//${orig.jsonPath}`)}\n`,
            `msgid ${JSON.stringify(orig.text)}\n`,
            `msgstr ${JSON.stringify(translationStr)}\n`,
          );
          await poFileHandle.writeFile(lines.join(''));
        }
      }

      for (let poFileHandle of chapterFileHandles.values()) {
        await poFileHandle.close();
      }
    }

    console.log('Done!');
  }

  public async downloadTranslations(force: boolean): Promise<void> {
    try {
      this.progressBar.setTaskInfo('Скачивание данных о главах на Ноте...');
      this.progressBar.setIndeterminate();

      let statuses: Map<string, ChapterStatus> = await this.notaClient.fetchAllChapterStatuses();
      let prevStatuses: Map<string, ChapterStatus> = await this.readChapterStatuses();

      await fs.promises.mkdir(CHAPTER_FRAGMENTS_DIR, { recursive: true });

      let chaptersWithUpdates: ChapterStatus[] = [];
      let chaptersWithoutUpdates: ChapterStatus[] = [];
      for (let status of statuses.values()) {
        let prevStatus = prevStatuses.get(status.name);
        let needsUpdate =
          prevStatus == null || status.modificationTimestamp !== prevStatus.modificationTimestamp;
        (force || needsUpdate ? chaptersWithUpdates : chaptersWithoutUpdates).push(status);
      }

      let chapterFragments = new Map<string, Fragment[]>();

      for (let [i, chapterStatus] of chaptersWithoutUpdates.entries()) {
        console.log(`loading ${chapterStatus.name} from disk`);
        this.progressBar.setTaskInfo(`Чтение главы '${chapterStatus.name}' с диска...`);
        this.progressBar.setValue(i, chaptersWithoutUpdates.length);

        let fragments: Fragment[] = await fsUtils.readJsonFile(
          paths.join(CHAPTER_FRAGMENTS_DIR, `${chapterStatus.name}.json`),
        );
        chapterFragments.set(chapterStatus.name, fragments);
      }

      let totalNotaPagesCount = 0;
      let fetchedNotaPagesCount = 0;
      let fetchers: Array<{ chapterName: string; fetcher: asyncUtils.Fetcher<Fragment[]> }> = [];
      for (let chapter of chaptersWithUpdates) {
        let fetcher = this.notaClient.createChapterFragmentFetcher(chapter);
        totalNotaPagesCount += fetcher.total;
        fetchers.push({ chapterName: chapter.name, fetcher });
      }

      for (let { chapterName, fetcher } of fetchers) {
        console.log(`downloading ${chapterName}`);
        this.progressBar.setTaskInfo(`Скачивание главы '${chapterName}' с Ноты...`);
        let fragments: Fragment[] = [];

        let self = this;
        await asyncUtils.limitConcurrency(
          iteratorUtils.map(fetcher.iterator, async (pageFragmentsPromise) => {
            let pageFragments = await pageFragmentsPromise;
            fragments.push(...pageFragments);
            self.progressBar.setValue(fetchedNotaPagesCount, totalNotaPagesCount);
            fetchedNotaPagesCount++;
          }),
          8,
        );

        fragments.sort((f1, f2) => f1.orderNumber - f2.orderNumber);
        chapterFragments.set(chapterName, fragments);
        await fsUtils.writeJsonFile(
          paths.join(CHAPTER_FRAGMENTS_DIR, `${chapterName}.json`),
          fragments,
        );
      }

      let scanDb: ScanDb | null = null;
      if (this.useScanDb) {
        this.progressBar.setTaskInfo('Чтение базы данных сканирования CrossLocalE...');
        this.progressBar.setIndeterminate();
        scanDb = ScanDb.fromJSON(await fsUtils.readJsonFile(CROSSLOCALE_SCAN_DB_FILE));
      }

      let packer = new LocalizeMePacker(scanDb);
      let packedFragmentsCount = 0;
      let allChapterFragmentsCount = 0;
      for (let fragments of chapterFragments.values()) {
        allChapterFragmentsCount += fragments.length;
      }
      for (let [name, fragments] of chapterFragments.entries()) {
        console.log(`generating packs for ${name}`);
        this.progressBar.setTaskInfo(
          `Генерация транслейт-паков Localize Me для главы '${name}'...`,
        );

        for (let fragment of fragments) {
          this.progressBar.setValue(packedFragmentsCount, allChapterFragmentsCount);
          await packer.addNotaFragment(fragment);
          packedFragmentsCount++;
        }
        await asyncUtils.waitForAnimationFrame();
      }

      let mappingTable: Record<string, string> = {};

      await fs.promises.mkdir(LOCALIZE_ME_PACKS_DIR, { recursive: true });

      let totalPackCount = packer.packs.size;
      for (let [i, [originalFile, packContents]] of iteratorUtils.enumerate(
        packer.packs.entries(),
      )) {
        this.progressBar.setTaskInfo(`Запись транслейт-пака '${originalFile}'...`);
        this.progressBar.setValue(i, totalPackCount + 1);
        mappingTable[originalFile] = originalFile;
        let outputPath = paths.join(LOCALIZE_ME_PACKS_DIR, originalFile);
        await fs.promises.mkdir(paths.dirname(outputPath), { recursive: true });
        await fsUtils.writeJsonFile(outputPath, packContents);
      }

      this.progressBar.setTaskInfo(`Запись таблицы маппингов транслейт-паков...`);
      this.progressBar.setValue(totalPackCount, totalPackCount + 1);
      await fsUtils.writeJsonFile(LOCALIZE_ME_MAPPING_FILE, mappingTable);

      await this.writeChapterStatuses(statuses);

      console.log('DONE');
      this.progressBar.setTaskInfo('Скачивание переводов успешно завершено!');
      this.progressBar.setDone();
    } catch (err) {
      console.error('err', err);
      this.progressBar.setTaskError(err);
    }
  }

  public async readChapterStatuses(): Promise<Map<string, ChapterStatus>> {
    return miscUtils.objectToMap((await fsUtils.readJsonFileOptional(CHAPTER_STATUSES_FILE)) ?? {});
  }

  public async writeChapterStatuses(statuses: Map<string, ChapterStatus>): Promise<void> {
    await fsUtils.writeJsonFile(CHAPTER_STATUSES_FILE, miscUtils.mapToObject(statuses));
  }
}

function showDevTools(): Promise<void> {
  return new Promise((resolve) =>
    // eslint-disable-next-line no-undefined
    nw.Window.get().showDevTools(undefined, () => resolve()),
  );
}

class ProgressBar {
  public element = document.getElementById(
    'settings_translations_progress',
  )! as HTMLProgressElement;
  public taskElement = document.getElementById('settings_translations_progressTask')!;
  public taskErrorElement = document.getElementById('settings_translations_progressTask_error')!;
  public countElement = document.getElementById('settings_translations_progressCount')!;

  public setTaskInfo(info: { toString(): string }): void {
    this.taskErrorElement.style.display = 'none';
    this.taskElement.textContent = info.toString();
  }

  public setTaskError(err: { toString(): string }): void {
    this.taskErrorElement.style.display = 'inline';
    this.taskElement.textContent = err.toString();
    this.setDone();
  }

  public setIndeterminate(): void {
    this.element.removeAttribute('value');
    this.countElement.textContent = '';
  }

  public setValue(value: number, total: number): void {
    this.element.value = value;
    this.element.max = total;
    let percentStr = ((value / total) * 100).toFixed();
    this.countElement.textContent = `${percentStr}% (${value} / ${total})`;
  }

  public setDone(): void {
    this.element.value = 0;
    this.countElement.textContent = '';
  }
}

interface LocalizableStringData {
  jsonPath: string[];
  langUid: number;
  description?: string[] | null;
  text: string;
}

function findLangLabelsInFile(
  isLangFile: boolean,
  data: unknown,
): Generator<LocalizableStringData> {
  return isLangFile
    ? findStringsInLangFileObject((data as { labels: unknown }).labels, ['labels'])
    : findLangLabelsInObject(data);
}

function* findStringsInLangFileObject(
  obj: unknown,
  jsonPath: string[] = [],
): Generator<LocalizableStringData> {
  if (obj == null) return;

  if (typeof obj === 'string') {
    yield { jsonPath, langUid: 0, text: obj };
  } else if (miscUtils.isObject(obj)) {
    for (let key in obj) {
      if (miscUtils.hasKey(obj, key)) {
        yield* findStringsInLangFileObject(obj[key], [...jsonPath, key]);
      }
    }
  }
}

function* findLangLabelsInObject(
  obj: unknown,
  jsonPath: string[] = [],
): Generator<LocalizableStringData> {
  if (!miscUtils.isObject(obj)) return;

  if (miscUtils.hasKey(obj, 'en_US')) {
    if (typeof obj.en_US !== 'string') {
      throw new Error(`Invalid LangLabel at ${jsonPath.join('/')}`);
    }
    let text = obj.en_US;

    let langUid = 0;
    if (miscUtils.hasKey(obj, 'langUid')) {
      if (typeof obj.langUid !== 'number') {
        throw new Error(`Invalid LangLabel at ${jsonPath.join('/')}`);
      }
      langUid = obj.langUid;
    }

    yield { jsonPath, langUid, text };
    return;
  }

  for (let key in obj) {
    if (miscUtils.hasKey(obj, key)) {
      yield* findLangLabelsInObject(obj[key], [...jsonPath, key]);
    }
  }
}

function isLangLabelIgnored(langLabel: LocalizableStringData, filePath: string): boolean {
  /* eslint-disable no-useless-escape */

  if (IGNORED_LABELS.has(langLabel.text.trim())) return true;

  let jsonPathStr = langLabel.jsonPath.join('/');

  filePath = filePath.replace(/^extension\/[^\/]+\//, '');

  if (
    /^data\/credits\/.+\.json$/.test(filePath) &&
    /^entries\/[^\/]+\/names\/\d+$/.test(jsonPathStr)
  ) {
    return true;
  }

  if (/^data\/enemies\/.+\.json$/.test(filePath) && /^meta\/.+$/.test(jsonPathStr)) {
    return true;
  }

  return false;

  /* eslint-enable no-useless-escape */
}
