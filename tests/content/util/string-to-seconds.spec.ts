import {
	FunctionTestData,
	describeAndTestFunction,
} from '#/helpers/test-function';

import Util from '@/content/util';

const functionTestData: FunctionTestData<typeof Util.stringToSeconds>[] = [
	{
		description: 'should trim string and parse time',
		funcParameters: ['01:10:30 '],
		expectedValue: 4230,
	},
	{
		description: 'should parse time in hh:mm:ss format',
		funcParameters: ['01:10:30'],
		expectedValue: 4230,
	},
	{
		description: 'should parse negative time',
		funcParameters: ['-01:10'],
		expectedValue: -70,
	},
	{
		description: 'should parse time in mm:ss format',
		funcParameters: ['05:20'],
		expectedValue: 320,
	},
	{
		description: 'should parse time in ss format',
		funcParameters: ['20'],
		expectedValue: 20,
	},
	{
		description: 'should not parse empty string',
		funcParameters: [''],
		expectedValue: 0,
	},
	{
		description: 'should not parse null value',
		funcParameters: [null],
		expectedValue: 0,
	},
];

describeAndTestFunction(Util.stringToSeconds.bind(Util), functionTestData);
