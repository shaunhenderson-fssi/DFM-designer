import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { findComponentAtLine, findComponentByName, parseDfm } from '../dfmParser';
import { renderComponent, toHtmlColor } from '../renderer';
import { getConstraintValue } from '../extension';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('parses dotted font properties into renderer-friendly names', () => {
		const parsed = parseDfm(`
object Label1: TLabel
  Left = 826
  Font.Color = clSilver
  Font.Height = -24
  Font.Name = 'Arial'
  Font.Style = [fsBold]
end
		`);

		assert.strictEqual(parsed[0].properties.FontColor, 'clSilver');
		assert.strictEqual(parsed[0].properties.FontHeight, '-24');
		assert.strictEqual(parsed[0].properties.FontName, "'Arial'");
		assert.strictEqual(parsed[0].properties.FontStyle, '[fsBold]');
	});

	test('maps Delphi named colors to HTML colors', () => {
		const form = parseDfm(fs.readFileSync(path.join(__dirname, '..', '..', 'example', 'dlgEzipayManualCardNum.dfm'), 'utf8'))[0];
		assert.strictEqual(form.properties.Color, 'clBtnFace');
		assert.strictEqual(toHtmlColor(form.properties.Color), '#c0c0c0');
		assert.strictEqual(toHtmlColor('clBtnFace'), '#c0c0c0');
		assert.strictEqual(toHtmlColor('clActiveCaption'), '#808080');
		assert.strictEqual(toHtmlColor('clHighlight'), '#000080');
		assert.strictEqual(toHtmlColor('clInfoBk'), '#ffffe1');
		assert.strictEqual(toHtmlColor('clMenu'), '#c0c0c0');
		assert.strictEqual(toHtmlColor('clNone'), 'transparent');
		assert.strictEqual(toHtmlColor('clAliceBlue'), '#f0f8ff');
		assert.strictEqual(toHtmlColor('clBlueViolet'), '#8a2be2');
	});

	test('reads form constraint values whether they are nested or flattened', () => {
		const flatForm = {
			ConstraintsMinWidth: '800',
			ConstraintsMaxWidth: '1200',
			ConstraintsMinHeight: '600',
			ConstraintsMaxHeight: '900'
		};
		const nestedForm = {
			Constraints: {
				MinWidth: 800,
				MaxWidth: 1200,
				MinHeight: 600,
				MaxHeight: 900
			}
		};

		assert.strictEqual(getConstraintValue(flatForm, 'MinWidth'), '800');
		assert.strictEqual(getConstraintValue(flatForm, 'MaxWidth'), '1200');
		assert.strictEqual(getConstraintValue(nestedForm, 'MinWidth'), 800);
		assert.strictEqual(getConstraintValue(nestedForm, 'MaxHeight'), 900);
	});

	test('finds a component by name and by selection line', () => {
		const parsed = parseDfm(`
object frmCustDisp: TForm
  object btnOk: TButton
    Left = 10
  end
  object lblTitle: TLabel
    Left = 20
  end
end
		`);

		assert.strictEqual(findComponentByName(parsed, 'btnOk')?.name, 'btnOk');
		assert.strictEqual(findComponentAtLine(parsed, 3)?.name, 'btnOk');
		assert.strictEqual(findComponentAtLine(parsed, 6)?.name, 'lblTitle');
	});

	test('keeps the root form range intact when complex DFM blocks are present', () => {
		const dfmText = fs.readFileSync(path.join(__dirname, '..', '..', 'example', 'CustDisp.dfm'), 'utf8');
		const parsed = parseDfm(dfmText);

		assert.ok(parsed.length > 0);
		assert.ok(parsed[0].endLine > parsed[0].lineNumber);
		assert.strictEqual(findComponentAtLine(parsed, 14809)?.name, 'imgFlashCard');
		assert.strictEqual(findComponentAtLine(parsed, 15199)?.name, 'pnlWeight');
	});

	test('parses multiline brace blocks for picture data', () => {
		const parsed = parseDfm(`
object imgCustomer: TImage
  Left = 517
  Picture.Data = {
    055449636F6E00000100010020200001
  }
end
		`);

		assert.ok(parsed[0].properties.PictureData?.includes('055449636F6E00000100010020200001'));
	});

	test('parses TGridPanel grid collections', () => {
		const parsed = parseDfm(`
object gpnl: TGridPanel
  Left = 8
  Top = 152
  Width = 769
  Height = 153
  ColumnCollection = <
    item
      Value = 17.355371900826440000
    end
    item
      Value = 82.644628099173560000
    end
  >
  RowCollection = <
    item
      Value = 50.000000000000000000
    end
    item
      Value = 50.000000000000000000
    end
    item
      SizeStyle = ssAuto
    end
  >
end
		`);

		assert.strictEqual(Array.isArray(parsed[0].properties.ColumnCollection), true);
		assert.strictEqual(parsed[0].properties.ColumnCollection.length, 2);
		assert.strictEqual(parsed[0].properties.RowCollection.length, 3);
		assert.strictEqual(parsed[0].properties.ColumnCollection[0].Value, '17.355371900826440000');
	});

	test('parses and renders TRichEdit as a textarea', () => {
		const parsed = parseDfm(`
object mmoScript: TRichEdit
  Left = 66
  Top = 17
  Width = 698
  Height = 446
  Lines.Strings = (
    '# Use Help > Reference to see a list of commands'
    'Second line')
end
		`);

		assert.strictEqual(parsed[0].properties.LinesStrings, '# Use Help > Reference to see a list of commands\nSecond line');
		const html = renderComponent(parsed[0]);
		assert.ok(html.includes('<textarea'));
		assert.ok(html.includes('id="mmoScript"'));
		assert.ok(html.includes('# Use Help &gt; Reference to see a list of commands\nSecond line'));
		assert.ok(html.includes('background: #ffffff;'));
	});

	test('renders TEdit controls with a visible edit surface', () => {
		const html = renderComponent({
			name: 'edtCardNum1',
			className: 'TEdit',
			properties: {
				Left: '286', Top: '15', Width: '156', Height: '28',
				MaxLength: '14', FontHeight: '-16', FontStyle: '[fsBold]', FontName: 'MS Sans Serif'
			},
			children: [],
			lineNumber: 3835,
			endLine: 3848
		} as any);

		assert.ok(html.includes('id="edtCardNum1"'));
		assert.ok(html.includes('background: #ffffff;'));
		assert.ok(html.includes('maxlength="14"'));
	});

	test('renders a TPanel with the Delphi button-face default', () => {
		const html = renderComponent({
			name: 'Panel1',
			className: 'TPanel',
			properties: { Left: '0', Top: '0', Width: '460', Height: '264' },
			children: []
		} as any);

		assert.ok(html.includes('background: #c0c0c0;'));
	});

	test('renders TGridPanel as a CSS grid', () => {
		const html = renderComponent({
			name: 'gpnl',
			className: 'TGridPanel',
			properties: {
				Left: '8',
				Top: '152',
				Width: '769',
				Height: '153',
				ColumnCollection: [
					{ Value: '17.355371900826440000' },
					{ Value: '82.644628099173560000' }
				],
				RowCollection: [
					{ Value: '50.000000000000000000' },
					{ Value: '50.000000000000000000' },
					{ SizeStyle: 'ssAuto' }
				],
				ControlCollection: [
					{ Column: '1', Row: '1', Control: 'lblDUO' }
				]
			},
			children: [
				{
					name: 'lblDUO',
					className: 'TLabel',
					properties: { Caption: 'DUO MFA', Left: '424', Top: '68', Width: '65', Height: '20' },
					children: [],
					lineNumber: 0,
					endLine: 0,
					widthLine: -1,
					heightLine: -1,
					leftLine: -1,
					topLine: -1
				}
			],
			lineNumber: 0,
			endLine: 0,
			widthLine: -1,
			heightLine: -1,
			leftLine: -1,
			topLine: -1
		} as any);

		assert.ok(html.includes('display: grid'));
		assert.ok(html.includes('grid-template-columns: 17.35537190082644% 82.64462809917356%;'));
	});

	test('renders TCheckBox caption as a span beside a checkbox input', () => {
		const html = renderComponent({
			name: 'chkHoverText',
			className: 'TCheckBox',
			properties: {
				Caption: 'Inspector & details',
				Left: '500',
				Top: '8',
				Width: '100',
				Height: '17'
			},
			children: []
		} as any);

		assert.ok(html.includes('<div'));
		assert.ok(html.includes('<input'));
		assert.ok(html.includes('type="checkbox"'));
		assert.ok(html.includes('<span>Inspector  details</span>'));
	});

	test('escapes html in rendered captions and names', () => {
		const html = renderComponent({
			name: 'Label1',
			className: 'TLabel',
			properties: {
				Caption: 'Tom & Jerry <3',
				Left: '10',
				Top: '20',
				Width: '100',
				Height: '30'
			},
			children: []
		} as any);

		assert.ok(html.includes('Tom  Jerry &lt;3'));
	});

	test('keeps nested child objects after multiline parenthesized values', () => {
		const parsed = parseDfm(`
object frmCustDisp: TfrmCustDisp
  DesignSize = (
    1024
    768)
  TextHeight = 13
  object imgBackGround: TImage
    Left = 0
  end
  object lblHeading2: TLabel
    Left = 16
  end
end
		`);

		assert.strictEqual(parsed[0].children.length, 2);
		assert.strictEqual(parsed[0].children[0].name, 'imgBackGround');
		assert.strictEqual(parsed[0].children[1].name, 'lblHeading2');
	});

	test('parses and renders nested controls inside TGroupBox containers', () => {
		const parsed = parseDfm(`
object Form1: TForm
  object grpTop: TGroupBox
    Left = 0
    Top = 0
    Width = 766
    Height = 33
    object lblDefaultWindowName: TLabel
      Left = 3
      Top = 9
      Width = 116
      Height = 15
      Caption = 'Default window name'
    end
    object defaultWindowName: TEdit
      Left = 135
      Top = 6
      Width = 121
      Height = 23
      Text = 'PointOfSale'
    end
  end
end
		`);

		assert.strictEqual(parsed[0].children.length, 1);
		assert.strictEqual(parsed[0].children[0].className, 'TGroupBox');
		assert.strictEqual(parsed[0].children[0].children.length, 2);
		assert.strictEqual(parsed[0].children[0].children[0].name, 'lblDefaultWindowName');

		const html = renderComponent(parsed[0]);
		assert.ok(html.includes('id="grpTop"'));
		assert.ok(html.includes('id="lblDefaultWindowName"'));
		assert.ok(html.includes('id="defaultWindowName"'));
	});

	test('renders Delphi-wrapped TPngImage picture data as a PNG data URL', () => {
		const html = renderComponent({
			name: 'imgAccess',
			className: 'TImage',
			properties: {
				PictureData: '0954506E67496D61676589504E470D0A1A0A0000000D4948445200000040000000400806000000AA6971DE',
				Left: '34',
				Top: '4',
				Width: '66',
				Height: '70'
			},
			children: []
		} as any);

		assert.ok(html.includes('data:image/png;base64,'));
	});

	test('renders icon-style picture data as an ICO data URL', () => {
		const html = renderComponent({
			name: 'imgCustomer',
			className: 'TImage',
			properties: {
				PictureData: '055449636F6E0000010001002020000101000800A8080000160000002800000020000000400000000100080000000008004000000000000000000000010000000000000FFFFFF0000000000E0E0E000A8A0A0001010100000B8FF0020202000D098D000D0D0D000C0C0C000484848000050E000989898003030300058585800282828000068D000C84878009878D00068D0FF003838380040404000505050007810A0008848D000D86890000098FF00A0A0F800F0B8D0008840B80090E0FF001818D0000030D000181818002828F800E088A800E090B0006868680078787800F0B0C800A83878007848580050D0FF007850600060D0FF0078D8FF0060606000E898B800E8A0C000888890000070E0002828D8004040E800704050005050F00038C8FF0048C8FF00D87098005858F800C098F00078B8FF0080D8FF0070707000A0186000B8609000F0A8C8000088F0006838480020C0FF00D050800058D0FF00E078A000E080A800C080A800C888B000888888002090F800F0F8FF000090F8006060FF000088F8000078E0000078E8001088F8000080E800602840002020D8000000100018C0FF003030E0003838E000703850004848500070405800D05888009048E80058586000D060880070D8FF00E080A0003030F8004040F80088D8FF00A0E0FF007070F800E898B000E8A0B8007878F8008888F8009090F800D0B0F000F0C0D80080808000A02068003098F80058A8F80060B0F8006060F80060606800686870000080F00068304800707078006830400010C0FF0040A0F80048A0F8009048D80028C0FF0030C0FF0030C8FF004848F0009048E000D048780040C8FF00D058800038384000D86088001098FF007848600018182000B880F0001898FF0028A0FF0070D0FF00D8789800B888F00020A0FF0030A0FF0040A8FF00D878A000B890F00038A8FF0050B0FF00E088B00058B0FF0068B8FF004848F80070B8FF00C8A0F00090D8FF00E8A8C000C8A8F000808088000090FF0060B0FF000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010101010101010101010101010101010101040401010101060D140101010101010101010101010101010101010101010121215005323201060F141501010101010101010101010101010101010101010606055005513232010101150A160101010101010101010101010106040101010F05055305525251011801010A160E760101010101010101010101062104111179550D05054C0578545401181F01015C0E2E7726010101010101060611431111437B14050572054242420118561F010A0E2E257A0101010101010F11115B111135431458587D7C4E4E4E57183333010A16600101010101010101010F11113511115D5B1544447E441A1AA404185A59010A01010101010101010101010D111135111129350A828173801A1A1A217F34340101010101010101010101011445455D45852B295C373774370B0B0B068436830101010101010101010101010188615E295E872B291638387486370B0B0F5F3A36040101010101010101010101011519192989612B602A2A2A2A2A38381A0B0D5F4F75040101010101010101010101010A39398B19192B2E2C2C2C46462A8A1A200D4F4F21010101010101010101010101011647472B91391925139013132C468F8E1A148D8C21010101010101010101010E232348486396393E2D2D2D62132C95949315922206060101010101010101010101010E2424249A2363473E3D663D2D6213A599981597222206010101010101010101012E2F2F2F69242348261E1E1E3D2D133C9C9B0A3B65640F01010101010101010101253030306A2F2423701E671E6600003C3C9E163B3A9D0D010101010101010101013E412741A16A69234BA01E1E00131313133C0E9F68750D010101010101010101013E271C2741302F24313D000010101010101010132EA26C6B140101010101010101010101261C6F1C273000003131130E010101102525256E1B6D14010101010101010101010170271C2700000808083113010E0A0E0101070707071B1401010101010101010101A34100004A4940283F3F040A03030E0A0112121D170714010101010101010101014B4B080E010101017101060302090C0A0101011D14141401010101010101010101013108010E0E0A0E010104020002030E010A0E010101010101010101010101040A0303030E0A01044D0002030A01030E0A01010101010101010101010106030202090C0A010104020C0A0102090C0A0101010101010101010101010402000002030E01010101010A000002030E0101010101010101010101010602000002030A010101010602000002030A010101010101010101010101010602090C0A0101010101010602090C0A01010101010101010101010101010401010A010101010101010401010A01010101010101010101010101010101010101010101010101010101010101010101010101010101FFFC01FFFFF800FFFFF0003FFE10000FF8000003F0000003F000000FF000003FF000007FF000007FF000007FF000007FF000007FF000007FE000003FE000003FE000003FE000003FE000003FE000003FE000103FE000003FE000003FF00801FFF80000FFF80400FFF80600FFF80700FFFC0F81FFFE1FC3FFFFFFF',
				Left: '517',
				Top: '6',
				Width: '33',
				Height: '35'
			},
			children: []
		} as any);

		assert.ok(html.includes('data:image/x-icon;base64,'));
	});
});
