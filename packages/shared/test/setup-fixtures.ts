// bun test 시작 때 테스트용 지역 자료를 넣는다 (서비스 데이터 data/*.json 에는 [테스트] 자료가 없다).
import { replaceExploreData } from '../src/data';
import problems from './fixtures/problems.json';
import contexts from './fixtures/contexts.json';
import resources from './fixtures/resources.json';

replaceExploreData({ problems: problems as never, contexts: contexts as never, resources: resources as never });
