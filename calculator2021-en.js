var app = angular.module('app', []);
try {
  app = angular.module('app');
} catch (err) {
  app = angular.module('simulatorsApp', ['ngSanitize']);
  app.config(function ($controllerProvider) {
    app.cp = $controllerProvider;
  });
}
app.config(function ($interpolateProvider) {
  $interpolateProvider.startSymbol('{[{').endSymbol('}]}');
});
app.run([
  '$locale',
  function ($locale) {
    $locale.NUMBER_FORMATS.GROUP_SEP = ' ';
    //$locale.NUMBER_FORMATS.DECIMAL_SEP = ".";
  },
]);

app.filter('ceil', function () {
  return function (input) {
    var val = Math.ceil(input);
    val = val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return val;
  };
});

app.filter('round', function () {
  return function (input) {
    var val = Math.round(input);
    val = val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return val;
  };
});

function SalarioLiquidoCtrl($scope, $timeout) {
  var empresa_taxa_ss_social = 1.2375;
  $scope.input = {
    localizacao: null, //Continente, Açores ou Madeira. One of $scope.localizacaoes
    situacao: null, //Casado, solteiro, etc. One of $scope.situacoes
    dependentes: null, //Número de dependentes. One of $scope.dependentes
    deficiente: null, //Se é pessoa deficiente ou não. True ou False
    base: 900, //Vencimento base
    extra: 0, //Retribuição por horas extraordinárias
    refeicao_tipo: null, //Transferência ou cartão refeição. On of $scope.tipos_subsidio_refeicao
    refeicao_valor: 7.63, //Valor diário do subsídio de refeição
    refeicao_dias: 21, //Nº de dias em que foi pago o subsídio de refeição
    outros_IRS_SS: 0, //Outros rendimentos sujeitos a IRS e SS
    outros_IRS: 0, //Outros rendimentos sujeitos só a IRS
    outros_isentos: 0, //Outros rendimentos isentos de IRS
    taxa_ss: 11, //Taxa para a Segurança Social. Valor por defeito: 11%
    conjuge_deficiencia: false, //Se o cônjuge tem deficiência superior a 60%. Só se aplica caso situação = 'CAS1'
    dependentes_deficiencia: false, //Se algum dos dependentes tem deficiência superior a 60%. Só se aplica caso situação = 'CAS1'
    duodecimos_tipo: null, //Regime de duodécimos usado para pagar os subsídios de Natal e/ou Férias. One of $scope.duodecimos
  };

  $scope.result = {
    bruto: null, //Rendimento bruto = base + extra + refeicao_valor * refeicao_dias + outros_IRS_SS + outros_IRS + outros_isentos
    bruto_coverflex: null,
    tributavel: null, //Rendimento tributável, o que está sujeito a IRS. Exclui horas extra
    tributavel_coverflex: null,
    incidencia: null, //Base de incidência para a Segurança Social
    taxa: null, //Taxa a aplicar ao rendimento tributável
    retencao: null, //Valor a reter na fonte para IRS
    retencao_extra: null, //Valor a reter na fonte para IRS
    seg_social: null, //Valor a reter na fonte para SS
    valor_liquido: null, //Valor a receber
    subsidios: 0,
    taxa_subsidios: null,
    seg_social_subsidios: null,
    retencao_subsidios: null,
    subsidio_refeicao: null,
    custo_total_empresa: null,
    total_taxas: 0,
    notas: [], //Notas tidas em conta durante o processamento. One or more of $scope.notas
  };

  $scope.localizacoes = [
    { localizacao: 'CNT', descricao: 'Portugal Continental' },
    { localizacao: 'AZO', descricao: 'Açores' },
    { localizacao: 'MAD', descricao: 'Madeira' },
  ];

    //LEGISREF:
    $scope.situacoes = [
        { situacao: "SOL", descricao: "Single" },
        { situacao: "CAS1", descricao: "Married, 1 holder" },
        { situacao: "CAS2", descricao: "Married, 2 holders" }
    ];

  //LEGISREF:
  $scope.dependentes = [
    { numero: 0, descricao: '0' },
    { numero: 1, descricao: '1' },
    { numero: 2, descricao: '2' },
    { numero: 3, descricao: '3' },
    { numero: 4, descricao: '4' },
    { numero: 5, descricao: '5+' },
  ];

  //LEGISREF:
  $scope.tipos_subsidio_refeicao = [
    { tipo: 'NAOTENHO', descricao: 'No', isento: null },
    { tipo: 'CARTAO', descricao: 'Yes', isento: 7.63 },
    //{ tipo: "DINHEIRO", descricao: "Remuneração", isento: 4.77 }
  ];

  $scope.duodecimos = [
    { tipo: 'NAOTENHO', descricao: 'Não recebo os subsídios em duodécimos' },
    { tipo: '1x50%', descricao: 'Recebo 50% de um subsídio em duodécimos' },
    {
      tipo: '2x50%',
      descricao:
        'Recebo 50% dos dois subsídios ou 1 subsídio completo em duodécimos',
    },
    {
      tipo: '2x100%',
      descricao: 'Recebo os dois subsídios por inteiro em duodécimos',
    },
  ];

  $scope.notas = [
    {
      id: 'DepDef=5Dep',
      referencia: 'Despacho 791-A/2019 nº2 a)',
      descricao:
        'Cada dependente com <strong>grau de incapacidade permanente igual ou superior a 60%</strong> equivale, para efeitos de retenção na fonte, a cinco dependentes não deficientes',
    },
    {
      id: 'ConDef=5Dep',
      referencia: 'Despacho 791-A/2019 nº2 b)',
      descricao:
        'Na situação de «casado único titular», o cônjuge que, não auferindo rendimentos das categorias A ou H, seja portador de deficiência que lhe confira um <strong>grau de incapacidade permanente igual ou superior a 60%</strong>, equivale, para efeitos de retenção na fonte sobre rendimentos de trabalho dependente auferidos pelo outro cônjuge, a cinco dependentes não deficientes',
    },
    {
      id: 'UF=CAS',
      referencia: 'Despacho 791-A/2019, nº3 e 4',
      descricao:
        'As tabelas de retenção respeitantes aos sujeitos passivos casados aplicam-se igualmente às pessoas que vivam em união de facto.<hr/>Nas situações de sujeitos passivos casados ou unidos de facto em que um dos cônjuges ou unidos de facto aufira rendimentos da categoria A ou H, as tabelas de retenção «casado, único titular» só são aplicáveis quando o outro cônjuge ou unido de facto não aufira quaisquer rendimentos englobáveis ou, auferindo-os ambos os titulares, o rendimento de um deles seja igual ou superior a 95 % do rendimento englobado.',
    },
    {
      id: 'Dep',
      referencia: 'Código IRS, art. 13º nº5',
      descricao:
        'Consideram-se dependentes:<ol type="a"><li>Os filhos, adotados e enteados, menores não emancipados, bem como os menores sob tutela</li><li>Os filhos, adotados e enteados, maiores, bem como aqueles que até à maioridade estiveram sujeitos à tutela de qualquer dos sujeitos a quem incumbe a direção do agregado familiar, que não tenham mais de 25 anos nem aufiram anualmente rendimentos superiores ao valor da retribuição mínima mensal garantida</li><li>Os filhos, adotados, enteados e os sujeitos a tutela, maiores, inaptos para o trabalho e para angariar meios de subsistência</li><li>Os afilhados civis</li></ol>',
    },
    {
      id: 'TaxSS',
      referencia: 'Código dos Regimes Contributivos',
      descricao:
        'Embora o art. 53º do <a href="https://dre.pt/web/guest/legislacao-consolidada/-/lc/34514575/view?q=Código+dos+Regimes+Contributivos+do+Sistema+Previdencial+de+Segurança+Social" target="_blank">CRC</a> indique que a taxa contributivo do trabalhador é de 11%, há uma série de exceções. Para evitar complicar a calculadora, damos-lhe aqui a opção de indicar a que se adequa ao seu caso concreto.',
    },
    {
      id: 'SubRef',
      referencia: 'Código do IRS art. 2º nº 3 b) 2)',
      descricao:
        '3 - Consideram-se rendimentos do trabalho dependente:<br/>b) 2) O subsídio de refeição na parte em que exceder o limite legal estabelecido ou em que o exceda em 60 % sempre que o respetivo subsídio seja atribuído através de vales de refeição;<hr>',
    },
    {
      id: 'Extra',
      referencia: 'Código do IRS art. 99º-C nº5',
      descricao:
        'Os subsídios de férias e de natal, a remuneração relativa a trabalho suplementar e as remunerações relativas a anos anteriores àquele em que são pagas ou colocadas à disposição do sujeito passivo, são sempre objeto de retenção autónoma, não podendo, para cálculo do imposto a reter, ser adicionados às remunerações dos meses em que são pagos ou colocados à disposição.',
    },
    {
      id: 'OutIRSSS',
      referencia: '',
      descricao:
        'Outros rendimentos sujeitos a IRS e Segurança Social. Qualquer rendimento não incluído nas outras categorias.',
    },
    {
      id: 'OutIRS',
      referencia: 'Código Contributivo, art. 48º',
      descricao:
        'Não integram a base de incidência contributiva:<br/>a) pagamento por dias de férias ou de folga não gozados<br/>b) complemento de prestações do regime geral de segurança social<br/>c) subsídios para compensação de encargos familiares (creches, jardins de infância, estabelecimentos de educação, lares de idosos e outros serviços ou estabelecimentos de apoio social)<br/>d) subsídios destinados ao pagamento de despesas com assistência médica e medicamentosa do trabalhador e seus familiares<br/>e) subsídios de férias, de Natal e outros análogos relativos a bases de incidência convencionais<br/>f) refeições tomadas em refeitórios das entidades empregadoras<br/>g) indemnização por despedimento ilegal<br/>h) compensação por cessação do contrato de trabalho<br/>i) indemnização pela cessação, antes de findo o prazo convencional, do contrato de trabalho a prazo<br/>j) desconto concedido aos trabalhadores na aquisição de ações da entidade empregadora ou de sociedades dos grupos empresariais da entidade empregadora.',
    },
    {
      id: 'OutIse',
      referencia: 'Código do IRS art 2º-A nº 1',
      descricao:
        'Não se consideram rendimentos do trabalho dependente:<br/>a) As prestações efetuadas pelas entidades patronais para regimes obrigatórios de segurança social, ainda que de natureza privada, que visem assegurar exclusivamente benefícios em caso de reforma, invalidez ou sobrevivência;<br/>b) Os benefícios imputáveis à utilização e fruição de realizações de utilidade social e de lazer mantidas pela entidade patronal, desde que observados os critérios estabelecidos no artigo 43.º do Código do IRC e os "vales infância" emitidos e atribuídos nas condições previstas no Decreto-Lei n.º 26/99, de 28 de janeiro;<br/>c) As prestações relacionadas exclusivamente com ações de formação profissional dos trabalhadores, quer estas sejam ministradas pela entidade patronal, quer por organismos de direito público ou entidade reconhecida como tendo competência nos domínios da formação e reabilitação profissionais pelos ministérios competentes;<br/>d) As importâncias suportadas pelas entidades patronais com a aquisição de passes sociais a favor dos seus trabalhadores, desde que a atribuição dos mesmos tenha carácter geral;<br/>e) As importâncias suportadas pelas entidades patronais com seguros de saúde ou doença em benefício dos seus trabalhadores ou respetivos familiares desde que a atribuição dos mesmos tenha carácter geral;<br/>f) As importâncias suportadas pelas entidades patronais com encargos, indemnizações ou compensações, pagos no ano da deslocação, em dinheiro ou em espécie, devidos pela mudança do local de trabalho, quando este passe a situar-se a uma distância superior a 100 km do local de trabalho anterior, na parte que não exceda 10 % da remuneração anual, com o limite de (euro) 4 200 por ano.',
    },
  ];

  //LEGISREF:
  $scope.taxas_retencao = { CNT: {}, MAD: {}, AZO: {} };
  $scope.taxas_retencao['CNT'] = {
    SOL: [
      { max: 659.0, 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 686.0, 0: 0.001, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 718.0, 0: 0.042, 1: 0.008, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 739.0, 0: 0.073, 1: 0.028, 2: 0.002, 3: 0, 4: 0, 5: 0 },
      { max: 814.0, 0: 0.082, 1: 0.046, 2: 0.011, 3: 0, 4: 0, 5: 0 },
      { max: 922.0, 0: 0.104, 1: 0.069, 2: 0.036, 3: 0, 4: 0, 5: 0 },
      { max: 1005.0, 0: 0.116, 1: 0.082, 2: 0.058, 3: 0.015, 4: 0, 5: 0 },
      { max: 1065.0, 0: 0.124, 1: 0.091, 2: 0.067, 3: 0.034, 4: 0, 5: 0 },
      {
        max: 1143.0,
        0: 0.135,
        1: 0.11,
        2: 0.086,
        3: 0.052,
        4: 0.028,
        5: 0.003,
      },
      {
        max: 1225.0,
        0: 0.145,
        1: 0.121,
        2: 0.096,
        3: 0.062,
        4: 0.037,
        5: 0.013,
      },
      {
        max: 1321.0,
        0: 0.156,
        1: 0.132,
        2: 0.108,
        3: 0.072,
        4: 0.047,
        5: 0.023,
      },
      {
        max: 1424.0,
        0: 0.166,
        1: 0.142,
        2: 0.117,
        3: 0.083,
        4: 0.067,
        5: 0.041,
      },
      {
        max: 1562.0,
        0: 0.177,
        1: 0.152,
        2: 0.127,
        3: 0.103,
        4: 0.078,
        5: 0.051,
      },
      {
        max: 1711.0,
        0: 0.191,
        1: 0.167,
        2: 0.152,
        3: 0.117,
        4: 0.092,
        5: 0.067,
      },
      {
        max: 1870.0,
        0: 0.205,
        1: 0.187,
        2: 0.178,
        3: 0.149,
        4: 0.129,
        5: 0.12,
      },
      {
        max: 1977.0,
        0: 0.215,
        1: 0.199,
        2: 0.187,
        3: 0.159,
        4: 0.149,
        5: 0.129,
      },
      {
        max: 2090.0,
        0: 0.225,
        1: 0.208,
        2: 0.198,
        3: 0.168,
        4: 0.159,
        5: 0.139,
      },
      {
        max: 2218.0,
        0: 0.235,
        1: 0.219,
        2: 0.209,
        3: 0.18,
        4: 0.169,
        5: 0.149,
      },
      {
        max: 2367.0,
        0: 0.245,
        1: 0.229,
        2: 0.219,
        3: 0.19,
        4: 0.181,
        5: 0.159,
      },
      { max: 2535.0, 0: 0.255, 1: 0.249, 2: 0.229, 3: 0.21, 4: 0.19, 5: 0.181 },
      { max: 2767.0, 0: 0.265, 1: 0.258, 2: 0.24, 3: 0.22, 4: 0.2, 5: 0.19 },
      {
        max: 3104.0,
        0: 0.278,
        1: 0.271,
        2: 0.252,
        3: 0.232,
        4: 0.212,
        5: 0.202,
      },
      {
        max: 3534.0,
        0: 0.294,
        1: 0.291,
        2: 0.275,
        3: 0.259,
        4: 0.253,
        5: 0.237,
      },
      {
        max: 4118.0,
        0: 0.305,
        1: 0.303,
        2: 0.285,
        3: 0.269,
        4: 0.263,
        5: 0.257,
      },
      {
        max: 4650.0,
        0: 0.323,
        1: 0.318,
        2: 0.302,
        3: 0.284,
        4: 0.278,
        5: 0.272,
      },
      {
        max: 5194.0,
        0: 0.333,
        1: 0.328,
        2: 0.322,
        3: 0.297,
        4: 0.288,
        5: 0.282,
      },
      { max: 5880.0, 0: 0.343, 1: 0.338, 2: 0.332, 3: 0.306, 4: 0.3, 5: 0.292 },
      {
        max: 6727.0,
        0: 0.363,
        1: 0.359,
        2: 0.351,
        3: 0.332,
        4: 0.328,
        5: 0.324,
      },
      {
        max: 7939.0,
        0: 0.373,
        1: 0.369,
        2: 0.365,
        3: 0.352,
        4: 0.338,
        5: 0.334,
      },
      {
        max: 9560.0,
        0: 0.393,
        1: 0.389,
        2: 0.385,
        3: 0.372,
        4: 0.386,
        5: 0.354,
      },
      {
        max: 11282.0,
        0: 0.403,
        1: 0.399,
        2: 0.395,
        3: 0.386,
        4: 0.378,
        5: 0.364,
      },
      {
        max: 18854.0,
        0: 0.413,
        1: 0.409,
        2: 0.405,
        3: 0.396,
        4: 0.392,
        5: 0.374,
      },
      {
        max: 20221.0,
        0: 0.423,
        1: 0.419,
        2: 0.415,
        3: 0.406,
        4: 0.412,
        5: 0.384,
      },
      {
        max: 22749.0,
        0: 0.431,
        1: 0.429,
        2: 0.425,
        3: 0.416,
        4: 0.412,
        5: 0.396,
      },
      {
        max: 25276.0,
        0: 0.441,
        1: 0.439,
        2: 0.435,
        3: 0.426,
        4: 0.422,
        5: 0.408,
      },
      {
        min: 25276.0,
        0: 0.451,
        1: 0.449,
        2: 0.445,
        3: 0.436,
        4: 0.432,
        5: 0.418,
      },
    ],
    'SOL+DEF': [
      { max: 1310.0, 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 1414.0, 0: 0.013, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 1455.0, 0: 0.042, 1: 0.007, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 1639.0, 0: 0.052, 1: 0.027, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 1956.0, 0: 0.067, 1: 0.048, 2: 0.038, 3: 0.003, 4: 0, 5: 0 },
      { max: 2079.0, 0: 0.082, 1: 0.063, 2: 0.053, 3: 0.023, 4: 0.013, 5: 0 },
      {
        max: 2213.0,
        0: 0.101,
        1: 0.073,
        2: 0.063,
        3: 0.043,
        4: 0.023,
        5: 0.013,
      },
      {
        max: 2314.0,
        0: 0.126,
        1: 0.097,
        2: 0.078,
        3: 0.058,
        4: 0.038,
        5: 0.028,
      },
      {
        max: 2479.0,
        0: 0.146,
        1: 0.117,
        2: 0.098,
        3: 0.078,
        4: 0.059,
        5: 0.038,
      },
      {
        max: 2561.0,
        0: 0.155,
        1: 0.137,
        2: 0.117,
        3: 0.098,
        4: 0.068,
        5: 0.059,
      },
      {
        max: 2663.0,
        0: 0.166,
        1: 0.147,
        2: 0.127,
        3: 0.108,
        4: 0.088,
        5: 0.078,
      },
      {
        max: 2929.0,
        0: 0.176,
        1: 0.157,
        2: 0.137,
        3: 0.118,
        4: 0.108,
        5: 0.098,
      },
      {
        max: 3247.0,
        0: 0.187,
        1: 0.172,
        2: 0.156,
        3: 0.141,
        4: 0.135,
        5: 0.129,
      },
      {
        max: 3585.0,
        0: 0.199,
        1: 0.184,
        2: 0.168,
        3: 0.152,
        4: 0.146,
        5: 0.14,
      },
      {
        max: 3718.0,
        0: 0.209,
        1: 0.196,
        2: 0.188,
        3: 0.162,
        4: 0.156,
        5: 0.15,
      },
      { max: 3933.0, 0: 0.219, 1: 0.206, 2: 0.2, 3: 0.172, 4: 0.166, 5: 0.16 },
      { max: 4353.0, 0: 0.239, 1: 0.226, 2: 0.22, 3: 0.194, 4: 0.186, 5: 0.18 },
      { max: 4620.0, 0: 0.249, 1: 0.236, 2: 0.23, 3: 0.204, 4: 0.198, 5: 0.19 },
      {
        max: 4916.0,
        0: 0.259,
        1: 0.246,
        2: 0.24,
        3: 0.214,
        4: 0.208,
        5: 0.202,
      },
      {
        max: 5204.0,
        0: 0.269,
        1: 0.256,
        2: 0.25,
        3: 0.224,
        4: 0.218,
        5: 0.212,
      },
      {
        max: 5634.0,
        0: 0.279,
        1: 0.266,
        2: 0.26,
        3: 0.244,
        4: 0.228,
        5: 0.222,
      },
      {
        max: 6064.0,
        0: 0.294,
        1: 0.281,
        2: 0.275,
        3: 0.259,
        4: 0.243,
        5: 0.237,
      },
      {
        max: 6768.0,
        0: 0.303,
        1: 0.293,
        2: 0.289,
        3: 0.275,
        4: 0.261,
        5: 0.257,
      },
      {
        max: 7236.0,
        0: 0.313,
        1: 0.304,
        2: 0.299,
        3: 0.285,
        4: 0.271,
        5: 0.267,
      },
      {
        max: 7817.0,
        0: 0.323,
        1: 0.314,
        2: 0.31,
        3: 0.295,
        4: 0.291,
        5: 0.277,
      },
      {
        max: 8500.0,
        0: 0.333,
        1: 0.324,
        2: 0.32,
        3: 0.306,
        4: 0.296,
        5: 0.287,
      },
      {
        max: 9284.0,
        0: 0.343,
        1: 0.334,
        2: 0.33,
        3: 0.316,
        4: 0.302,
        5: 0.297,
      },
      {
        max: 10018.0,
        0: 0.358,
        1: 0.349,
        2: 0.345,
        3: 0.331,
        4: 0.327,
        5: 0.313,
      },
      {
        max: 12535.0,
        0: 0.368,
        1: 0.359,
        2: 0.355,
        3: 0.341,
        4: 0.337,
        5: 0.323,
      },
      {
        min: 12535.0,
        0: 0.378,
        1: 0.369,
        2: 0.365,
        3: 0.351,
        4: 0.347,
        5: 0.333,
      },
    ],
    CAS1: [
      { max: 659.0, 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 686.0, 0: 0.001, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 708.0, 0: 0.024, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 754.0, 0: 0.034, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 794.0, 0: 0.048, 1: 0.01, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 836.0, 0: 0.057, 1: 0.019, 2: 0.01, 3: 0, 4: 0, 5: 0 },
      { max: 886.0, 0: 0.066, 1: 0.038, 2: 0.013, 3: 0, 4: 0, 5: 0 },
      { max: 974.0, 0: 0.074, 1: 0.047, 2: 0.03, 3: 0, 4: 0, 5: 0 },
      { max: 1081.0, 0: 0.083, 1: 0.056, 2: 0.038, 3: 0.011, 4: 0, 5: 0 },
      { max: 1225.0, 0: 0.094, 1: 0.07, 2: 0.048, 3: 0.021, 4: 0.002, 5: 0 },
      {
        max: 1404.0,
        0: 0.109,
        1: 0.091,
        2: 0.072,
        3: 0.044,
        4: 0.027,
        5: 0.018,
      },
      {
        max: 1629.0,
        0: 0.119,
        1: 0.102,
        2: 0.083,
        3: 0.064,
        4: 0.046,
        5: 0.028,
      },
      {
        max: 1733.0,
        0: 0.134,
        1: 0.116,
        2: 0.108,
        3: 0.079,
        4: 0.06,
        5: 0.052,
      },
      {
        max: 1849.0,
        0: 0.143,
        1: 0.127,
        2: 0.119,
        3: 0.092,
        4: 0.074,
        5: 0.066,
      },
      {
        max: 1998.0,
        0: 0.153,
        1: 0.136,
        2: 0.128,
        3: 0.102,
        4: 0.094,
        5: 0.076,
      },
      {
        max: 2157.0,
        0: 0.163,
        1: 0.146,
        2: 0.138,
        3: 0.111,
        4: 0.104,
        5: 0.087,
      },
      {
        max: 2347.0,
        0: 0.173,
        1: 0.166,
        2: 0.149,
        3: 0.121,
        4: 0.113,
        5: 0.097,
      },
      {
        max: 2566.0,
        0: 0.182,
        1: 0.176,
        2: 0.159,
        3: 0.141,
        4: 0.123,
        5: 0.116,
      },
      {
        max: 2934.0,
        0: 0.193,
        1: 0.186,
        2: 0.169,
        3: 0.151,
        4: 0.134,
        5: 0.126,
      },
      {
        max: 3356.0,
        0: 0.219,
        1: 0.218,
        2: 0.202,
        3: 0.188,
        4: 0.174,
        5: 0.17,
      },
      {
        max: 3611.0,
        0: 0.229,
        1: 0.228,
        2: 0.214,
        3: 0.198,
        4: 0.194,
        5: 0.18,
      },
      { max: 3882.0, 0: 0.239, 1: 0.238, 2: 0.224, 3: 0.21, 4: 0.204, 5: 0.19 },
      { max: 4210.0, 0: 0.249, 1: 0.248, 2: 0.234, 3: 0.22, 4: 0.216, 5: 0.21 },
      {
        max: 4604.0,
        0: 0.264,
        1: 0.258,
        2: 0.244,
        3: 0.23,
        4: 0.226,
        5: 0.222,
      },
      {
        max: 5076.0,
        0: 0.274,
        1: 0.268,
        2: 0.264,
        3: 0.24,
        4: 0.236,
        5: 0.232,
      },
      {
        max: 5654.0,
        0: 0.284,
        1: 0.278,
        2: 0.274,
        3: 0.25,
        4: 0.246,
        5: 0.242,
      },
      {
        max: 6381.0,
        0: 0.294,
        1: 0.288,
        2: 0.284,
        3: 0.26,
        4: 0.256,
        5: 0.252,
      },
      {
        max: 7323.0,
        0: 0.303,
        1: 0.302,
        2: 0.298,
        3: 0.276,
        4: 0.274,
        5: 0.272,
      },
      {
        max: 8441.0,
        0: 0.313,
        1: 0.312,
        2: 0.31,
        3: 0.296,
        4: 0.284,
        5: 0.282,
      },
      {
        max: 9336.0,
        0: 0.328,
        1: 0.327,
        2: 0.325,
        3: 0.313,
        4: 0.299,
        5: 0.297,
      },
      {
        max: 10448.0,
        0: 0.338,
        1: 0.337,
        2: 0.335,
        3: 0.323,
        4: 0.321,
        5: 0.306,
      },
      {
        max: 14013.0,
        0: 0.351,
        1: 0.351,
        2: 0.345,
        3: 0.333,
        4: 0.331,
        5: 0.319,
      },
      {
        max: 20118.0,
        0: 0.371,
        1: 0.371,
        2: 0.369,
        3: 0.358,
        4: 0.356,
        5: 0.344,
      },
      {
        max: 22749.0,
        0: 0.381,
        1: 0.381,
        2: 0.379,
        3: 0.372,
        4: 0.366,
        5: 0.354,
      },
      {
        max: 25276.0,
        0: 0.391,
        1: 0.391,
        2: 0.389,
        3: 0.382,
        4: 0.38,
        5: 0.364,
      },
      {
        max: 28309.0,
        0: 0.401,
        1: 0.401,
        2: 0.399,
        3: 0.392,
        4: 0.39,
        5: 0.378,
      },
      {
        min: 28309.0,
        0: 0.411,
        1: 0.411,
        2: 0.409,
        3: 0.402,
        4: 0.4,
        5: 0.388,
      },
    ],
    'CAS1+DEF': [
      { max: 1650.0, 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 1753.0, 0: 0.009, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 1905.0, 0: 0.038, 1: 0.011, 2: 0.003, 3: 0, 4: 0, 5: 0 },
      { max: 1972.0, 0: 0.048, 1: 0.031, 2: 0.023, 3: 0.005, 4: 0, 5: 0 },
      { max: 2342.0, 0: 0.058, 1: 0.051, 2: 0.033, 3: 0.015, 4: 0, 5: 0 },
      { max: 2520.0, 0: 0.067, 1: 0.061, 2: 0.043, 3: 0.025, 4: 0.007, 5: 0 },
      {
        max: 2767.0,
        0: 0.087,
        1: 0.08,
        2: 0.063,
        3: 0.045,
        4: 0.037,
        5: 0.019,
      },
      {
        max: 2971.0,
        0: 0.097,
        1: 0.09,
        2: 0.073,
        3: 0.055,
        4: 0.047,
        5: 0.029,
      },
      {
        max: 3186.0,
        0: 0.112,
        1: 0.105,
        2: 0.088,
        3: 0.07,
        4: 0.062,
        5: 0.044,
      },
      {
        max: 3356.0,
        0: 0.124,
        1: 0.121,
        2: 0.107,
        3: 0.093,
        4: 0.089,
        5: 0.085,
      },
      { max: 3513.0, 0: 0.139, 1: 0.138, 2: 0.122, 3: 0.108, 4: 0.104, 5: 0.1 },
      {
        max: 3616.0,
        0: 0.149,
        1: 0.148,
        2: 0.144,
        3: 0.118,
        4: 0.114,
        5: 0.11,
      },
      { max: 3826.0, 0: 0.159, 1: 0.158, 2: 0.154, 3: 0.13, 4: 0.124, 5: 0.12 },
      { max: 3933.0, 0: 0.169, 1: 0.168, 2: 0.164, 3: 0.14, 4: 0.136, 5: 0.13 },
      {
        max: 4251.0,
        0: 0.179,
        1: 0.178,
        2: 0.174,
        3: 0.15,
        4: 0.146,
        5: 0.142,
      },
      {
        max: 4456.0,
        0: 0.189,
        1: 0.188,
        2: 0.184,
        3: 0.16,
        4: 0.156,
        5: 0.152,
      },
      {
        max: 4891.0,
        0: 0.199,
        1: 0.198,
        2: 0.194,
        3: 0.17,
        4: 0.166,
        5: 0.162,
      },
      {
        max: 5316.0,
        0: 0.209,
        1: 0.208,
        2: 0.204,
        3: 0.18,
        4: 0.176,
        5: 0.172,
      },
      { max: 5526.0, 0: 0.219, 1: 0.218, 2: 0.214, 3: 0.2, 4: 0.186, 5: 0.182 },
      {
        max: 5961.0,
        0: 0.229,
        1: 0.228,
        2: 0.224,
        3: 0.21,
        4: 0.196,
        5: 0.192,
      },
      {
        max: 6274.0,
        0: 0.239,
        1: 0.238,
        2: 0.234,
        3: 0.22,
        4: 0.206,
        5: 0.202,
      },
      {
        max: 6856.0,
        0: 0.252,
        1: 0.252,
        2: 0.25,
        3: 0.236,
        4: 0.224,
        5: 0.222,
      },
      {
        max: 7385.0,
        0: 0.262,
        1: 0.262,
        2: 0.26,
        3: 0.248,
        4: 0.244,
        5: 0.232,
      },
      {
        max: 8224.0,
        0: 0.272,
        1: 0.272,
        2: 0.27,
        3: 0.258,
        4: 0.256,
        5: 0.242,
      },
      {
        max: 9178.0,
        0: 0.282,
        1: 0.282,
        2: 0.28,
        3: 0.268,
        4: 0.266,
        5: 0.254,
      },
      {
        max: 10232.0,
        0: 0.297,
        1: 0.297,
        2: 0.295,
        3: 0.283,
        4: 0.281,
        5: 0.269,
      },
      {
        max: 11287.0,
        0: 0.306,
        1: 0.306,
        2: 0.304,
        3: 0.293,
        4: 0.291,
        5: 0.279,
      },
      {
        max: 13008.0,
        0: 0.321,
        1: 0.321,
        2: 0.319,
        3: 0.307,
        4: 0.305,
        5: 0.294,
      },
      {
        min: 13008.0,
        0: 0.331,
        1: 0.331,
        2: 0.329,
        3: 0.317,
        4: 0.315,
        5: 0.303,
      },
    ],
    CAS2: [
      { max: 659.0, 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 686.0, 0: 0.001, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 718.0, 0: 0.042, 1: 0.013, 2: 0.009, 3: 0.004, 4: 0, 5: 0 },
      { max: 739.0, 0: 0.073, 1: 0.044, 2: 0.026, 3: 0.007, 4: 0, 5: 0 },
      { max: 814.0, 0: 0.082, 1: 0.053, 2: 0.035, 3: 0.026, 4: 0.007, 5: 0 },
      {
        max: 922.0,
        0: 0.104,
        1: 0.076,
        2: 0.067,
        3: 0.039,
        4: 0.032,
        5: 0.013,
      },
      {
        max: 1005.0,
        0: 0.116,
        1: 0.089,
        2: 0.081,
        3: 0.053,
        4: 0.045,
        5: 0.032,
      },
      {
        max: 1065.0,
        0: 0.124,
        1: 0.098,
        2: 0.089,
        3: 0.062,
        4: 0.049,
        5: 0.04,
      },
      {
        max: 1143.0,
        0: 0.135,
        1: 0.117,
        2: 0.109,
        3: 0.082,
        4: 0.073,
        5: 0.055,
      },
      {
        max: 1225.0,
        0: 0.145,
        1: 0.128,
        2: 0.118,
        3: 0.092,
        4: 0.083,
        5: 0.065,
      },
      { max: 1321.0, 0: 0.156, 1: 0.148, 2: 0.13, 3: 0.11, 4: 0.093, 5: 0.084 },
      {
        max: 1424.0,
        0: 0.166,
        1: 0.158,
        2: 0.14,
        3: 0.122,
        4: 0.103,
        5: 0.095,
      },
      {
        max: 1562.0,
        0: 0.177,
        1: 0.169,
        2: 0.15,
        3: 0.132,
        4: 0.114,
        5: 0.105,
      },
      {
        max: 1711.0,
        0: 0.191,
        1: 0.183,
        2: 0.166,
        3: 0.147,
        4: 0.138,
        5: 0.12,
      },
      {
        max: 1870.0,
        0: 0.205,
        1: 0.199,
        2: 0.182,
        3: 0.165,
        4: 0.157,
        5: 0.139,
      },
      {
        max: 1977.0,
        0: 0.215,
        1: 0.21,
        2: 0.191,
        3: 0.174,
        4: 0.166,
        5: 0.149,
      },
      {
        max: 2090.0,
        0: 0.225,
        1: 0.22,
        2: 0.202,
        3: 0.183,
        4: 0.176,
        5: 0.168,
      },
      {
        max: 2218.0,
        0: 0.235,
        1: 0.23,
        2: 0.213,
        3: 0.195,
        4: 0.185,
        5: 0.179,
      },
      {
        max: 2367.0,
        0: 0.245,
        1: 0.241,
        2: 0.233,
        3: 0.205,
        4: 0.197,
        5: 0.188,
      },
      { max: 2535.0, 0: 0.255, 1: 0.251, 2: 0.243, 3: 0.216, 4: 0.208, 5: 0.2 },
      { max: 2767.0, 0: 0.265, 1: 0.26, 2: 0.253, 3: 0.226, 4: 0.218, 5: 0.21 },
      {
        max: 3104.0,
        0: 0.278,
        1: 0.273,
        2: 0.265,
        3: 0.238,
        4: 0.23,
        5: 0.222,
      },
      {
        max: 3534.0,
        0: 0.294,
        1: 0.293,
        2: 0.289,
        3: 0.265,
        4: 0.261,
        5: 0.257,
      },
      {
        max: 4118.0,
        0: 0.305,
        1: 0.305,
        2: 0.299,
        3: 0.285,
        4: 0.271,
        5: 0.267,
      },
      {
        max: 4650.0,
        0: 0.323,
        1: 0.32,
        2: 0.316,
        3: 0.299,
        4: 0.286,
        5: 0.282,
      },
      {
        max: 5194.0,
        0: 0.333,
        1: 0.33,
        2: 0.326,
        3: 0.312,
        4: 0.305,
        5: 0.292,
      },
      {
        max: 5880.0,
        0: 0.343,
        1: 0.34,
        2: 0.336,
        3: 0.322,
        4: 0.318,
        5: 0.301,
      },
      {
        max: 6727.0,
        0: 0.363,
        1: 0.361,
        2: 0.355,
        3: 0.348,
        4: 0.346,
        5: 0.344,
      },
      {
        max: 7939.0,
        0: 0.373,
        1: 0.371,
        2: 0.369,
        3: 0.358,
        4: 0.356,
        5: 0.354,
      },
      {
        max: 9560.0,
        0: 0.393,
        1: 0.391,
        2: 0.389,
        3: 0.378,
        4: 0.376,
        5: 0.374,
      },
      {
        max: 11282.0,
        0: 0.403,
        1: 0.401,
        2: 0.399,
        3: 0.392,
        4: 0.386,
        5: 0.384,
      },
      {
        max: 18854.0,
        0: 0.413,
        1: 0.411,
        2: 0.409,
        3: 0.402,
        4: 0.4,
        5: 0.394,
      },
      {
        max: 20221.0,
        0: 0.423,
        1: 0.421,
        2: 0.419,
        3: 0.412,
        4: 0.41,
        5: 0.404,
      },
      {
        max: 22749.0,
        0: 0.431,
        1: 0.431,
        2: 0.429,
        3: 0.422,
        4: 0.42,
        5: 0.416,
      },
      {
        max: 25276.0,
        0: 0.441,
        1: 0.441,
        2: 0.439,
        3: 0.432,
        4: 0.43,
        5: 0.428,
      },
      {
        min: 25276.0,
        0: 0.451,
        1: 0.451,
        2: 0.449,
        3: 0.442,
        4: 0.44,
        5: 0.438,
      },
    ],
    'CAS2+DEF': [
      { max: 1310.0, 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 1414.0, 0: 0.013, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 1455.0, 0: 0.037, 1: 0.029, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 1639.0, 0: 0.047, 1: 0.039, 2: 0.02, 3: 0, 4: 0, 5: 0 },
      { max: 1956.0, 0: 0.067, 1: 0.059, 2: 0.042, 3: 0.024, 4: 0.016, 5: 0 },
      {
        max: 2079.0,
        0: 0.082,
        1: 0.075,
        2: 0.056,
        3: 0.039,
        4: 0.031,
        5: 0.023,
      },
      {
        max: 2213.0,
        0: 0.101,
        1: 0.085,
        2: 0.077,
        3: 0.058,
        4: 0.041,
        5: 0.033,
      },
      {
        max: 2314.0,
        0: 0.126,
        1: 0.109,
        2: 0.092,
        3: 0.074,
        4: 0.065,
        5: 0.057,
      },
      {
        max: 2479.0,
        0: 0.146,
        1: 0.129,
        2: 0.111,
        3: 0.094,
        4: 0.076,
        5: 0.067,
      },
      {
        max: 2561.0,
        0: 0.155,
        1: 0.139,
        2: 0.131,
        3: 0.113,
        4: 0.096,
        5: 0.088,
      },
      {
        max: 2663.0,
        0: 0.165,
        1: 0.149,
        2: 0.141,
        3: 0.123,
        4: 0.106,
        5: 0.098,
      },
      {
        max: 2929.0,
        0: 0.175,
        1: 0.159,
        2: 0.151,
        3: 0.134,
        4: 0.116,
        5: 0.108,
      },
      {
        max: 3247.0,
        0: 0.187,
        1: 0.174,
        2: 0.17,
        3: 0.156,
        4: 0.143,
        5: 0.139,
      },
      {
        max: 3585.0,
        0: 0.199,
        1: 0.186,
        2: 0.182,
        3: 0.168,
        4: 0.154,
        5: 0.15,
      },
      {
        max: 3718.0,
        0: 0.209,
        1: 0.198,
        2: 0.192,
        3: 0.178,
        4: 0.174,
        5: 0.16,
      },
      {
        max: 3933.0,
        0: 0.219,
        1: 0.208,
        2: 0.204,
        3: 0.188,
        4: 0.184,
        5: 0.17,
      },
      {
        max: 4353.0,
        0: 0.234,
        1: 0.223,
        2: 0.219,
        3: 0.206,
        4: 0.199,
        5: 0.185,
      },
      {
        max: 4620.0,
        0: 0.244,
        1: 0.233,
        2: 0.229,
        3: 0.215,
        4: 0.211,
        5: 0.205,
      },
      {
        max: 4916.0,
        0: 0.254,
        1: 0.243,
        2: 0.239,
        3: 0.225,
        4: 0.221,
        5: 0.217,
      },
      {
        max: 5204.0,
        0: 0.264,
        1: 0.253,
        2: 0.249,
        3: 0.235,
        4: 0.231,
        5: 0.227,
      },
      {
        max: 5634.0,
        0: 0.274,
        1: 0.263,
        2: 0.259,
        3: 0.245,
        4: 0.241,
        5: 0.237,
      },
      {
        max: 6064.0,
        0: 0.289,
        1: 0.278,
        2: 0.274,
        3: 0.26,
        4: 0.256,
        5: 0.252,
      },
      {
        max: 6768.0,
        0: 0.303,
        1: 0.295,
        2: 0.293,
        3: 0.281,
        4: 0.279,
        5: 0.277,
      },
      {
        max: 7236.0,
        0: 0.313,
        1: 0.306,
        2: 0.302,
        3: 0.291,
        4: 0.289,
        5: 0.287,
      },
      { max: 7817.0, 0: 0.323, 1: 0.316, 2: 0.314, 3: 0.3, 4: 0.299, 5: 0.297 },
      {
        max: 8500.0,
        0: 0.333,
        1: 0.326,
        2: 0.324,
        3: 0.312,
        4: 0.308,
        5: 0.306,
      },
      {
        max: 9284.0,
        0: 0.343,
        1: 0.336,
        2: 0.334,
        3: 0.322,
        4: 0.32,
        5: 0.316,
      },
      {
        max: 10018.0,
        0: 0.358,
        1: 0.351,
        2: 0.349,
        3: 0.337,
        4: 0.335,
        5: 0.333,
      },
      {
        max: 12535.0,
        0: 0.368,
        1: 0.361,
        2: 0.359,
        3: 0.347,
        4: 0.345,
        5: 0.343,
      },
      {
        min: 12535.0,
        0: 0.378,
        1: 0.371,
        2: 0.369,
        3: 0.357,
        4: 0.355,
        5: 0.353,
      },
    ],
  };
  $scope.taxas_retencao['MAD'] = {
    SOL: [
      { max: 659, 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 686, 0: 0.001, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 718, 0: 0.034, 1: 0.006, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 739, 0: 0.055, 1: 0.021, 2: 0.002, 3: 0, 4: 0, 5: 0 },
      { max: 814, 0: 0.069, 1: 0.039, 2: 0.009, 3: 0, 4: 0, 5: 0 },
      { max: 922, 0: 0.088, 1: 0.058, 2: 0.03, 3: 0.0, 4: 0, 5: 0 },
      { max: 1005, 0: 0.098, 1: 0.069, 2: 0.049, 3: 0.013, 4: 0, 5: 0 },
      { max: 1065, 0: 0.111, 1: 0.081, 2: 0.06, 3: 0.03, 4: 0, 5: 0 },
      { max: 1143, 0: 0.121, 1: 0.098, 2: 0.077, 3: 0.047, 4: 0.025, 5: 0.003 },
      { max: 1225, 0: 0.13, 1: 0.108, 2: 0.086, 3: 0.056, 4: 0.033, 5: 0.012 },
      { max: 1321, 0: 0.14, 1: 0.118, 2: 0.097, 3: 0.064, 4: 0.042, 5: 0.021 },
      { max: 1424, 0: 0.149, 1: 0.127, 2: 0.105, 3: 0.074, 4: 0.06, 5: 0.037 },
      { max: 1562, 0: 0.158, 1: 0.136, 2: 0.114, 3: 0.092, 4: 0.07, 5: 0.046 },
      { max: 1711, 0: 0.171, 1: 0.15, 2: 0.136, 3: 0.105, 4: 0.082, 5: 0.06 },
      { max: 1870, 0: 0.192, 1: 0.175, 2: 0.167, 3: 0.14, 4: 0.121, 5: 0.112 },
      { max: 1977, 0: 0.201, 1: 0.186, 2: 0.175, 3: 0.149, 4: 0.14, 5: 0.121 },
      { max: 2090, 0: 0.211, 1: 0.195, 2: 0.185, 3: 0.157, 4: 0.149, 5: 0.13 },
      { max: 2218, 0: 0.22, 1: 0.205, 2: 0.196, 3: 0.169, 4: 0.158, 5: 0.14 },
      { max: 2367, 0: 0.229, 1: 0.214, 2: 0.205, 3: 0.178, 4: 0.17, 5: 0.149 },
      { max: 2535, 0: 0.239, 1: 0.233, 2: 0.214, 3: 0.197, 4: 0.178, 5: 0.17 },
      { max: 2767, 0: 0.248, 1: 0.242, 2: 0.225, 3: 0.206, 4: 0.187, 5: 0.178 },
      { max: 3104, 0: 0.272, 1: 0.265, 2: 0.246, 3: 0.227, 4: 0.207, 5: 0.197 },
      { max: 3534, 0: 0.287, 1: 0.284, 2: 0.269, 3: 0.253, 4: 0.247, 5: 0.232 },
      { max: 4118, 0: 0.298, 1: 0.296, 2: 0.278, 3: 0.263, 4: 0.257, 5: 0.251 },
      { max: 4650, 0: 0.316, 1: 0.311, 2: 0.295, 3: 0.277, 4: 0.272, 5: 0.266 },
      { max: 5194, 0: 0.325, 1: 0.32, 2: 0.315, 3: 0.29, 4: 0.281, 5: 0.276 },
      { max: 5880, 0: 0.335, 1: 0.33, 2: 0.324, 3: 0.299, 4: 0.293, 5: 0.285 },
      { max: 6727, 0: 0.363, 1: 0.359, 2: 0.351, 3: 0.332, 4: 0.328, 5: 0.324 },
      { max: 7939, 0: 0.373, 1: 0.369, 2: 0.365, 3: 0.352, 4: 0.338, 5: 0.334 },
      { max: 9560, 0: 0.393, 1: 0.389, 2: 0.385, 3: 0.372, 4: 0.368, 5: 0.354 },
      {
        max: 11282,
        0: 0.403,
        1: 0.399,
        2: 0.395,
        3: 0.386,
        4: 0.378,
        5: 0.364,
      },
      {
        max: 18854,
        0: 0.413,
        1: 0.409,
        2: 0.405,
        3: 0.396,
        4: 0.392,
        5: 0.374,
      },
      {
        max: 20221,
        0: 0.423,
        1: 0.419,
        2: 0.415,
        3: 0.406,
        4: 0.402,
        5: 0.384,
      },
      {
        max: 22749,
        0: 0.431,
        1: 0.429,
        2: 0.425,
        3: 0.416,
        4: 0.412,
        5: 0.396,
      },
      {
        max: 25276,
        0: 0.441,
        1: 0.439,
        2: 0.435,
        3: 0.426,
        4: 0.422,
        5: 0.408,
      },
      {
        min: 25276,
        0: 0.451,
        1: 0.449,
        2: 0.445,
        3: 0.436,
        4: 0.432,
        5: 0.418,
      },
    ],
    'SOL+DEF': [
      { max: 1310, 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 1414, 0: 0.012, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 1455, 0: 0.038, 1: 0.006, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 1639, 0: 0.047, 1: 0.024, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 1956, 0: 0.063, 1: 0.045, 2: 0.036, 3: 0.003, 4: 0, 5: 0 },
      { max: 2079, 0: 0.077, 1: 0.059, 2: 0.05, 3: 0.022, 4: 0.012, 5: 0 },
      { max: 2213, 0: 0.095, 1: 0.068, 2: 0.059, 3: 0.04, 4: 0.022, 5: 0.012 },
      { max: 2314, 0: 0.118, 1: 0.091, 2: 0.073, 3: 0.054, 4: 0.036, 5: 0.026 },
      { max: 2479, 0: 0.137, 1: 0.11, 2: 0.092, 3: 0.073, 4: 0.055, 5: 0.036 },
      { max: 2561, 0: 0.145, 1: 0.128, 2: 0.11, 3: 0.092, 4: 0.064, 5: 0.055 },
      { max: 2663, 0: 0.155, 1: 0.138, 2: 0.119, 3: 0.101, 4: 0.082, 5: 0.073 },
      { max: 2929, 0: 0.165, 1: 0.147, 2: 0.128, 3: 0.111, 4: 0.101, 5: 0.092 },
      { max: 3247, 0: 0.183, 1: 0.168, 2: 0.152, 3: 0.138, 4: 0.132, 5: 0.126 },
      { max: 3585, 0: 0.194, 1: 0.18, 2: 0.164, 3: 0.149, 4: 0.143, 5: 0.137 },
      { max: 3718, 0: 0.204, 1: 0.192, 2: 0.184, 3: 0.158, 4: 0.152, 5: 0.147 },
      { max: 3933, 0: 0.214, 1: 0.201, 2: 0.195, 3: 0.168, 4: 0.162, 5: 0.156 },
      { max: 4353, 0: 0.234, 1: 0.221, 2: 0.215, 3: 0.19, 4: 0.182, 5: 0.176 },
      { max: 4620, 0: 0.243, 1: 0.231, 2: 0.225, 3: 0.199, 4: 0.193, 5: 0.186 },
      { max: 4916, 0: 0.253, 1: 0.24, 2: 0.234, 3: 0.209, 4: 0.203, 5: 0.197 },
      { max: 5204, 0: 0.263, 1: 0.25, 2: 0.244, 3: 0.219, 4: 0.213, 5: 0.207 },
      { max: 5634, 0: 0.273, 1: 0.26, 2: 0.254, 3: 0.238, 4: 0.223, 5: 0.217 },
      { max: 6064, 0: 0.287, 1: 0.275, 2: 0.269, 3: 0.253, 4: 0.237, 5: 0.232 },
      { max: 6768, 0: 0.303, 1: 0.293, 2: 0.289, 3: 0.275, 4: 0.261, 5: 0.257 },
      { max: 7236, 0: 0.313, 1: 0.304, 2: 0.299, 3: 0.285, 4: 0.271, 5: 0.267 },
      { max: 7817, 0: 0.323, 1: 0.314, 2: 0.31, 3: 0.295, 4: 0.291, 5: 0.277 },
      { max: 8500, 0: 0.333, 1: 0.324, 2: 0.32, 3: 0.306, 4: 0.296, 5: 0.287 },
      { max: 9284, 0: 0.343, 1: 0.334, 2: 0.33, 3: 0.316, 4: 0.302, 5: 0.297 },
      {
        max: 10018,
        0: 0.358,
        1: 0.349,
        2: 0.345,
        3: 0.331,
        4: 0.327,
        5: 0.313,
      },
      {
        max: 12535,
        0: 0.368,
        1: 0.359,
        2: 0.355,
        3: 0.341,
        4: 0.337,
        5: 0.323,
      },
      {
        min: 12535,
        0: 0.378,
        1: 0.369,
        2: 0.365,
        3: 0.351,
        4: 0.347,
        5: 0.333,
      },
    ],
    CAS1: [
      { max: 659, 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 686, 0: 0.001, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 708, 0: 0.018, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 754, 0: 0.026, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 794, 0: 0.037, 1: 0.008, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 836, 0: 0.043, 1: 0.014, 2: 0.008, 3: 0, 4: 0, 5: 0 },
      { max: 886, 0: 0.05, 1: 0.029, 2: 0.01, 3: 0, 4: 0, 5: 0 },
      { max: 974, 0: 0.058, 1: 0.036, 2: 0.022, 3: 0, 4: 0, 5: 0 },
      { max: 1081, 0: 0.065, 1: 0.044, 2: 0.03, 3: 0.009, 4: 0, 5: 0 },
      { max: 1225, 0: 0.072, 1: 0.054, 2: 0.037, 3: 0.016, 4: 0.002, 5: 0 },
      { max: 1404, 0: 0.098, 1: 0.081, 2: 0.064, 3: 0.039, 4: 0.024, 5: 0.016 },
      { max: 1629, 0: 0.107, 1: 0.091, 2: 0.074, 3: 0.057, 4: 0.041, 5: 0.025 },
      { max: 1733, 0: 0.12, 1: 0.104, 2: 0.097, 3: 0.071, 4: 0.054, 5: 0.047 },
      { max: 1849, 0: 0.134, 1: 0.119, 2: 0.111, 3: 0.086, 4: 0.069, 5: 0.062 },
      { max: 1998, 0: 0.143, 1: 0.127, 2: 0.12, 3: 0.096, 4: 0.088, 5: 0.071 },
      { max: 2157, 0: 0.153, 1: 0.137, 2: 0.129, 3: 0.104, 4: 0.097, 5: 0.081 },
      { max: 2347, 0: 0.162, 1: 0.155, 2: 0.14, 3: 0.113, 4: 0.106, 5: 0.091 },
      { max: 2566, 0: 0.17, 1: 0.165, 2: 0.149, 3: 0.132, 4: 0.115, 5: 0.109 },
      { max: 2934, 0: 0.181, 1: 0.174, 2: 0.158, 3: 0.141, 4: 0.126, 5: 0.118 },
      { max: 3356, 0: 0.214, 1: 0.213, 2: 0.197, 3: 0.184, 4: 0.17, 5: 0.166 },
      { max: 3611, 0: 0.224, 1: 0.223, 2: 0.209, 3: 0.193, 4: 0.19, 5: 0.176 },
      { max: 3882, 0: 0.234, 1: 0.233, 2: 0.219, 3: 0.205, 4: 0.199, 5: 0.186 },
      { max: 4210, 0: 0.243, 1: 0.242, 2: 0.229, 3: 0.215, 4: 0.211, 5: 0.205 },
      { max: 4604, 0: 0.258, 1: 0.252, 2: 0.238, 3: 0.225, 4: 0.221, 5: 0.217 },
      { max: 5076, 0: 0.268, 1: 0.262, 2: 0.258, 3: 0.234, 4: 0.231, 5: 0.227 },
      { max: 5654, 0: 0.277, 1: 0.272, 2: 0.268, 3: 0.244, 4: 0.24, 5: 0.236 },
      { max: 6381, 0: 0.287, 1: 0.281, 2: 0.277, 3: 0.254, 4: 0.25, 5: 0.246 },
      { max: 7323, 0: 0.303, 1: 0.302, 2: 0.298, 3: 0.276, 4: 0.274, 5: 0.272 },
      { max: 8441, 0: 0.313, 1: 0.312, 2: 0.31, 3: 0.296, 4: 0.284, 5: 0.282 },
      { max: 9336, 0: 0.328, 1: 0.327, 2: 0.325, 3: 0.313, 4: 0.299, 5: 0.297 },
      {
        max: 10448,
        0: 0.338,
        1: 0.337,
        2: 0.335,
        3: 0.323,
        4: 0.321,
        5: 0.306,
      },
      {
        max: 14013,
        0: 0.351,
        1: 0.351,
        2: 0.345,
        3: 0.333,
        4: 0.331,
        5: 0.319,
      },
      {
        max: 20118,
        0: 0.371,
        1: 0.371,
        2: 0.369,
        3: 0.358,
        4: 0.356,
        5: 0.344,
      },
      {
        max: 22749,
        0: 0.381,
        1: 0.381,
        2: 0.379,
        3: 0.372,
        4: 0.366,
        5: 0.354,
      },
      { max: 25276, 0: 0.391, 1: 0.391, 2: 0.389, 3: 0.382, 4: 0.38, 5: 0.364 },
      { max: 28309, 0: 0.401, 1: 0.401, 2: 0.399, 3: 0.392, 4: 0.39, 5: 0.378 },
      { min: 28309, 0: 0.411, 1: 0.411, 2: 0.409, 3: 0.402, 4: 0.4, 5: 0.388 },
    ],
    'CAS1+DEF': [
      { max: 1650, 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 1753, 0: 0.008, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 1905, 0: 0.034, 1: 0.01, 2: 0.003, 3: 0, 4: 0, 5: 0 },
      { max: 1972, 0: 0.045, 1: 0.029, 2: 0.022, 3: 0.005, 4: 0, 5: 0 },
      { max: 2342, 0: 0.054, 1: 0.048, 2: 0.031, 3: 0.014, 4: 0, 5: 0 },
      { max: 2520, 0: 0.063, 1: 0.057, 2: 0.04, 3: 0.023, 4: 0.007, 5: 0 },
      { max: 2767, 0: 0.081, 1: 0.075, 2: 0.059, 3: 0.042, 4: 0.035, 5: 0.018 },
      { max: 2971, 0: 0.091, 1: 0.084, 2: 0.068, 3: 0.052, 4: 0.044, 5: 0.027 },
      { max: 3186, 0: 0.109, 1: 0.103, 2: 0.086, 3: 0.068, 4: 0.061, 5: 0.043 },
      { max: 3356, 0: 0.121, 1: 0.118, 2: 0.105, 3: 0.091, 4: 0.087, 5: 0.083 },
      { max: 3513, 0: 0.136, 1: 0.135, 2: 0.119, 3: 0.106, 4: 0.102, 5: 0.098 },
      { max: 3616, 0: 0.146, 1: 0.145, 2: 0.141, 3: 0.115, 4: 0.111, 5: 0.107 },
      { max: 3826, 0: 0.155, 1: 0.154, 2: 0.15, 3: 0.127, 4: 0.121, 5: 0.117 },
      { max: 3933, 0: 0.165, 1: 0.164, 2: 0.16, 3: 0.137, 4: 0.133, 5: 0.127 },
      { max: 4251, 0: 0.175, 1: 0.174, 2: 0.17, 3: 0.147, 4: 0.143, 5: 0.139 },
      { max: 4456, 0: 0.185, 1: 0.184, 2: 0.18, 3: 0.156, 4: 0.152, 5: 0.149 },
      { max: 4891, 0: 0.194, 1: 0.193, 2: 0.19, 3: 0.166, 4: 0.162, 5: 0.158 },
      { max: 5316, 0: 0.204, 1: 0.203, 2: 0.199, 3: 0.176, 4: 0.172, 5: 0.168 },
      { max: 5526, 0: 0.214, 1: 0.213, 2: 0.209, 3: 0.195, 4: 0.182, 5: 0.178 },
      { max: 5961, 0: 0.224, 1: 0.223, 2: 0.219, 3: 0.205, 4: 0.192, 5: 0.188 },
      { max: 6274, 0: 0.234, 1: 0.233, 2: 0.229, 3: 0.215, 4: 0.201, 5: 0.197 },
      { max: 6858, 0: 0.252, 1: 0.252, 2: 0.25, 3: 0.235, 4: 0.223, 5: 0.221 },
      { max: 7385, 0: 0.262, 1: 0.262, 2: 0.26, 3: 0.248, 4: 0.243, 5: 0.231 },
      { max: 8224, 0: 0.272, 1: 0.272, 2: 0.27, 3: 0.258, 4: 0.256, 5: 0.241 },
      { max: 9178, 0: 0.282, 1: 0.282, 2: 0.28, 3: 0.268, 4: 0.266, 5: 0.254 },
      {
        max: 10232,
        0: 0.297,
        1: 0.297,
        2: 0.295,
        3: 0.283,
        4: 0.281,
        5: 0.269,
      },
      {
        max: 11287,
        0: 0.306,
        1: 0.306,
        2: 0.304,
        3: 0.293,
        4: 0.291,
        5: 0.279,
      },
      {
        max: 13008,
        0: 0.321,
        1: 0.321,
        2: 0.319,
        3: 0.307,
        4: 0.305,
        5: 0.294,
      },
      {
        min: 13008,
        0: 0.331,
        1: 0.331,
        2: 0.329,
        3: 0.317,
        4: 0.315,
        5: 0.303,
      },
    ],
    CAS2: [
      { max: 659, 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 686, 0: 0.001, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 718, 0: 0.034, 1: 0.01, 2: 0.007, 3: 0.003, 4: 0, 5: 0 },
      { max: 739, 0: 0.055, 1: 0.034, 2: 0.02, 3: 0.006, 4: 0, 5: 0 },
      { max: 814, 0: 0.069, 1: 0.045, 2: 0.03, 3: 0.022, 4: 0.006, 5: 0 },
      { max: 922, 0: 0.088, 1: 0.064, 2: 0.057, 3: 0.033, 4: 0.027, 5: 0.011 },
      { max: 1005, 0: 0.098, 1: 0.075, 2: 0.068, 3: 0.045, 4: 0.038, 5: 0.027 },
      { max: 1065, 0: 0.111, 1: 0.088, 2: 0.08, 3: 0.056, 4: 0.044, 5: 0.036 },
      { max: 1143, 0: 0.121, 1: 0.105, 2: 0.098, 3: 0.073, 4: 0.065, 5: 0.049 },
      { max: 1225, 0: 0.13, 1: 0.115, 2: 0.106, 3: 0.082, 4: 0.074, 5: 0.058 },
      { max: 1321, 0: 0.14, 1: 0.132, 2: 0.116, 3: 0.098, 4: 0.083, 5: 0.075 },
      { max: 1424, 0: 0.149, 1: 0.141, 2: 0.125, 3: 0.109, 4: 0.092, 5: 0.085 },
      { max: 1562, 0: 0.158, 1: 0.151, 2: 0.134, 3: 0.118, 4: 0.102, 5: 0.094 },
      { max: 1711, 0: 0.171, 1: 0.164, 2: 0.149, 3: 0.132, 4: 0.124, 5: 0.107 },
      { max: 1870, 0: 0.192, 1: 0.186, 2: 0.17, 3: 0.155, 4: 0.147, 5: 0.13 },
      { max: 1977, 0: 0.201, 1: 0.197, 2: 0.179, 3: 0.163, 4: 0.155, 5: 0.14 },
      { max: 2090, 0: 0.211, 1: 0.206, 2: 0.189, 3: 0.171, 4: 0.165, 5: 0.157 },
      { max: 2218, 0: 0.22, 1: 0.215, 2: 0.2, 3: 0.183, 4: 0.173, 5: 0.168 },
      { max: 2367, 0: 0.229, 1: 0.226, 2: 0.218, 3: 0.192, 4: 0.185, 5: 0.176 },
      { max: 2535, 0: 0.239, 1: 0.235, 2: 0.228, 3: 0.202, 4: 0.195, 5: 0.187 },
      { max: 2767, 0: 0.248, 1: 0.244, 2: 0.237, 3: 0.212, 4: 0.204, 5: 0.197 },
      { max: 3104, 0: 0.272, 1: 0.267, 2: 0.259, 3: 0.233, 4: 0.225, 5: 0.217 },
      { max: 3534, 0: 0.287, 1: 0.286, 2: 0.282, 3: 0.259, 4: 0.255, 5: 0.251 },
      { max: 4118, 0: 0.298, 1: 0.298, 2: 0.292, 3: 0.278, 4: 0.265, 5: 0.261 },
      { max: 4650, 0: 0.316, 1: 0.313, 2: 0.309, 3: 0.292, 4: 0.279, 5: 0.276 },
      { max: 5194, 0: 0.325, 1: 0.322, 2: 0.319, 3: 0.305, 4: 0.298, 5: 0.285 },
      { max: 5880, 0: 0.335, 1: 0.332, 2: 0.328, 3: 0.315, 4: 0.311, 5: 0.294 },
      { max: 6727, 0: 0.363, 1: 0.361, 2: 0.355, 3: 0.348, 4: 0.346, 5: 0.344 },
      { max: 7939, 0: 0.373, 1: 0.371, 2: 0.369, 3: 0.358, 4: 0.356, 5: 0.354 },
      { max: 9560, 0: 0.393, 1: 0.391, 2: 0.389, 3: 0.378, 4: 0.376, 5: 0.374 },
      {
        max: 11282,
        0: 0.403,
        1: 0.401,
        2: 0.399,
        3: 0.392,
        4: 0.386,
        5: 0.384,
      },
      { max: 18854, 0: 0.413, 1: 0.411, 2: 0.409, 3: 0.402, 4: 0.4, 5: 0.394 },
      { max: 20221, 0: 0.423, 1: 0.421, 2: 0.419, 3: 0.412, 4: 0.41, 5: 0.404 },
      { max: 22749, 0: 0.431, 1: 0.431, 2: 0.429, 3: 0.422, 4: 0.42, 5: 0.416 },
      { max: 25276, 0: 0.441, 1: 0.441, 2: 0.439, 3: 0.432, 4: 0.43, 5: 0.428 },
      { min: 25276, 0: 0.451, 1: 0.451, 2: 0.449, 3: 0.442, 4: 0.44, 5: 0.438 },
    ],
    'CAS2+DEF': [
      { max: 1310, 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 1414, 0: 0.012, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 1455, 0: 0.033, 1: 0.026, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 1639, 0: 0.042, 1: 0.035, 2: 0.018, 3: 0, 4: 0, 5: 0 },
      { max: 1956, 0: 0.063, 1: 0.055, 2: 0.039, 3: 0.022, 4: 0.015, 5: 0 },
      { max: 2079, 0: 0.077, 1: 0.07, 2: 0.052, 3: 0.037, 4: 0.029, 5: 0.022 },
      { max: 2213, 0: 0.095, 1: 0.08, 2: 0.072, 3: 0.054, 4: 0.038, 5: 0.031 },
      { max: 2314, 0: 0.118, 1: 0.102, 2: 0.086, 3: 0.069, 4: 0.061, 5: 0.053 },
      { max: 2479, 0: 0.137, 1: 0.121, 2: 0.104, 3: 0.088, 4: 0.071, 5: 0.063 },
      { max: 2561, 0: 0.145, 1: 0.13, 2: 0.123, 3: 0.106, 4: 0.09, 5: 0.082 },
      { max: 2663, 0: 0.155, 1: 0.14, 2: 0.132, 3: 0.115, 4: 0.099, 5: 0.092 },
      { max: 2929, 0: 0.165, 1: 0.149, 2: 0.141, 3: 0.126, 4: 0.109, 5: 0.101 },
      { max: 3247, 0: 0.183, 1: 0.17, 2: 0.166, 3: 0.152, 4: 0.14, 5: 0.136 },
      { max: 3585, 0: 0.194, 1: 0.182, 2: 0.178, 3: 0.164, 4: 0.15, 5: 0.147 },
      { max: 3718, 0: 0.204, 1: 0.193, 2: 0.188, 3: 0.174, 4: 0.17, 5: 0.156 },
      { max: 3933, 0: 0.214, 1: 0.203, 2: 0.199, 3: 0.184, 4: 0.18, 5: 0.166 },
      { max: 4353, 0: 0.229, 1: 0.218, 2: 0.214, 3: 0.2, 4: 0.194, 5: 0.181 },
      { max: 4620, 0: 0.238, 1: 0.228, 2: 0.224, 3: 0.21, 4: 0.206, 5: 0.2 },
      { max: 4916, 0: 0.248, 1: 0.237, 2: 0.234, 3: 0.22, 4: 0.216, 5: 0.212 },
      { max: 5204, 0: 0.258, 1: 0.247, 2: 0.243, 3: 0.23, 4: 0.226, 5: 0.222 },
      { max: 5634, 0: 0.268, 1: 0.257, 2: 0.253, 3: 0.239, 4: 0.235, 5: 0.232 },
      { max: 6064, 0: 0.282, 1: 0.272, 2: 0.268, 3: 0.254, 4: 0.25, 5: 0.246 },
      { max: 6768, 0: 0.303, 1: 0.295, 2: 0.293, 3: 0.281, 4: 0.279, 5: 0.277 },
      { max: 7236, 0: 0.313, 1: 0.306, 2: 0.302, 3: 0.291, 4: 0.289, 5: 0.287 },
      { max: 7817, 0: 0.323, 1: 0.316, 2: 0.314, 3: 0.3, 4: 0.299, 5: 0.297 },
      { max: 8500, 0: 0.333, 1: 0.326, 2: 0.324, 3: 0.312, 4: 0.308, 5: 0.306 },
      { max: 9284, 0: 0.343, 1: 0.336, 2: 0.334, 3: 0.322, 4: 0.32, 5: 0.316 },
      {
        max: 10018,
        0: 0.358,
        1: 0.351,
        2: 0.349,
        3: 0.337,
        4: 0.335,
        5: 0.333,
      },
      {
        max: 12535,
        0: 0.368,
        1: 0.361,
        2: 0.359,
        3: 0.347,
        4: 0.345,
        5: 0.343,
      },
      {
        min: 12535,
        0: 0.378,
        1: 0.371,
        2: 0.369,
        3: 0.357,
        4: 0.355,
        5: 0.353,
      },
    ],
  };
  $scope.taxas_retencao['AZO'] = {
    SOL: [
      { max: 659, 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 686, 0: 0.001, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 718, 0: 0.029, 1: 0.006, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 739, 0: 0.051, 1: 0.019, 2: 0.001, 3: 0, 4: 0, 5: 0 },
      { max: 814, 0: 0.057, 1: 0.033, 2: 0.007, 3: 0, 4: 0, 5: 0 },
      { max: 922, 0: 0.072, 1: 0.048, 2: 0.025, 3: 0.0, 4: 0, 5: 0 },
      { max: 1005, 0: 0.081, 1: 0.057, 2: 0.04, 3: 0.01, 4: 0, 5: 0 },
      { max: 1065, 0: 0.091, 1: 0.066, 2: 0.048, 3: 0.025, 4: 0, 5: 0 },
      { max: 1143, 0: 0.099, 1: 0.08, 2: 0.062, 3: 0.037, 4: 0.02, 5: 0.002 },
      { max: 1225, 0: 0.106, 1: 0.088, 2: 0.07, 3: 0.045, 4: 0.027, 5: 0.009 },
      { max: 1321, 0: 0.113, 1: 0.097, 2: 0.078, 3: 0.052, 4: 0.035, 5: 0.017 },
      { max: 1424, 0: 0.12, 1: 0.104, 2: 0.086, 3: 0.06, 4: 0.048, 5: 0.03 },
      { max: 1562, 0: 0.128, 1: 0.11, 2: 0.093, 3: 0.075, 4: 0.056, 5: 0.037 },
      { max: 1711, 0: 0.139, 1: 0.121, 2: 0.11, 3: 0.086, 4: 0.067, 5: 0.048 },
      { max: 1870, 0: 0.151, 1: 0.137, 2: 0.13, 3: 0.109, 4: 0.095, 5: 0.088 },
      { max: 1977, 0: 0.158, 1: 0.146, 2: 0.137, 3: 0.116, 4: 0.109, 5: 0.095 },
      { max: 2090, 0: 0.171, 1: 0.159, 2: 0.151, 3: 0.127, 4: 0.12, 5: 0.106 },
      { max: 2218, 0: 0.179, 1: 0.167, 2: 0.159, 3: 0.136, 4: 0.128, 5: 0.113 },
      { max: 2367, 0: 0.186, 1: 0.175, 2: 0.167, 3: 0.145, 4: 0.137, 5: 0.12 },
      { max: 2535, 0: 0.194, 1: 0.189, 2: 0.175, 3: 0.16, 4: 0.145, 5: 0.137 },
      { max: 2767, 0: 0.202, 1: 0.196, 2: 0.182, 3: 0.168, 4: 0.152, 5: 0.145 },
      { max: 3104, 0: 0.219, 1: 0.213, 2: 0.197, 3: 0.182, 4: 0.167, 5: 0.159 },
      { max: 3534, 0: 0.231, 1: 0.229, 2: 0.216, 3: 0.204, 4: 0.199, 5: 0.186 },
      { max: 4118, 0: 0.241, 1: 0.239, 2: 0.224, 3: 0.211, 4: 0.207, 5: 0.202 },
      { max: 4650, 0: 0.255, 1: 0.251, 2: 0.238, 3: 0.223, 4: 0.218, 5: 0.214 },
      { max: 5194, 0: 0.263, 1: 0.259, 2: 0.254, 3: 0.233, 4: 0.226, 5: 0.222 },
      { max: 5880, 0: 0.27, 1: 0.266, 2: 0.262, 3: 0.241, 4: 0.237, 5: 0.229 },
      { max: 6727, 0: 0.29, 1: 0.287, 2: 0.281, 3: 0.266, 4: 0.262, 5: 0.259 },
      { max: 7939, 0: 0.298, 1: 0.295, 2: 0.292, 3: 0.282, 4: 0.27, 5: 0.267 },
      { max: 9560, 0: 0.314, 1: 0.311, 2: 0.308, 3: 0.298, 4: 0.294, 5: 0.283 },
      {
        max: 11282,
        0: 0.322,
        1: 0.319,
        2: 0.316,
        3: 0.309,
        4: 0.302,
        5: 0.291,
      },
      { max: 18854, 0: 0.33, 1: 0.327, 2: 0.324, 3: 0.317, 4: 0.314, 5: 0.299 },
      {
        max: 20221,
        0: 0.338,
        1: 0.335,
        2: 0.332,
        3: 0.325,
        4: 0.322,
        5: 0.307,
      },
      { max: 22749, 0: 0.345, 1: 0.343, 2: 0.34, 3: 0.333, 4: 0.33, 5: 0.317 },
      {
        max: 25276,
        0: 0.353,
        1: 0.351,
        2: 0.348,
        3: 0.341,
        4: 0.338,
        5: 0.326,
      },
      {
        min: 25276,
        0: 0.361,
        1: 0.359,
        2: 0.356,
        3: 0.349,
        4: 0.346,
        5: 0.334,
      },
    ],
    'SOL+DEF': [
      { max: 1310, 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 1414, 0: 0.009, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 1455, 0: 0.03, 1: 0.005, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 1639, 0: 0.038, 1: 0.019, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 1956, 0: 0.049, 1: 0.035, 2: 0.028, 3: 0.002, 4: 0, 5: 0 },
      { max: 2079, 0: 0.06, 1: 0.046, 2: 0.039, 3: 0.017, 4: 0.009, 5: 0 },
      { max: 2213, 0: 0.074, 1: 0.053, 2: 0.046, 3: 0.031, 4: 0.017, 5: 0.009 },
      { max: 2314, 0: 0.096, 1: 0.074, 2: 0.059, 3: 0.044, 4: 0.029, 5: 0.021 },
      { max: 2479, 0: 0.111, 1: 0.089, 2: 0.074, 3: 0.059, 4: 0.045, 5: 0.029 },
      { max: 2561, 0: 0.118, 1: 0.104, 2: 0.089, 3: 0.074, 4: 0.052, 5: 0.045 },
      { max: 2663, 0: 0.126, 1: 0.112, 2: 0.097, 3: 0.082, 4: 0.067, 5: 0.059 },
      { max: 2929, 0: 0.134, 1: 0.119, 2: 0.104, 3: 0.09, 4: 0.082, 5: 0.074 },
      { max: 3247, 0: 0.147, 1: 0.135, 2: 0.123, 3: 0.111, 4: 0.106, 5: 0.101 },
      { max: 3585, 0: 0.156, 1: 0.145, 2: 0.132, 3: 0.119, 4: 0.115, 5: 0.11 },
      { max: 3718, 0: 0.164, 1: 0.154, 2: 0.148, 3: 0.127, 4: 0.123, 5: 0.118 },
      { max: 3933, 0: 0.172, 1: 0.162, 2: 0.157, 3: 0.135, 4: 0.13, 5: 0.126 },
      { max: 4353, 0: 0.188, 1: 0.178, 2: 0.173, 3: 0.152, 4: 0.146, 5: 0.141 },
      { max: 4620, 0: 0.196, 1: 0.185, 2: 0.181, 3: 0.16, 4: 0.156, 5: 0.149 },
      { max: 4916, 0: 0.204, 1: 0.193, 2: 0.189, 3: 0.168, 4: 0.163, 5: 0.159 },
      { max: 5204, 0: 0.211, 1: 0.201, 2: 0.196, 3: 0.176, 4: 0.171, 5: 0.167 },
      { max: 5634, 0: 0.219, 1: 0.209, 2: 0.204, 3: 0.192, 4: 0.179, 5: 0.174 },
      { max: 6064, 0: 0.231, 1: 0.221, 2: 0.216, 3: 0.204, 4: 0.191, 5: 0.186 },
      { max: 6768, 0: 0.242, 1: 0.234, 2: 0.231, 3: 0.219, 4: 0.208, 5: 0.205 },
      { max: 7236, 0: 0.25, 1: 0.243, 2: 0.239, 3: 0.227, 4: 0.216, 5: 0.213 },
      { max: 7817, 0: 0.258, 1: 0.251, 2: 0.248, 3: 0.235, 4: 0.232, 5: 0.221 },
      { max: 8500, 0: 0.266, 1: 0.259, 2: 0.256, 3: 0.245, 4: 0.236, 5: 0.229 },
      { max: 9284, 0: 0.274, 1: 0.267, 2: 0.264, 3: 0.253, 4: 0.242, 5: 0.237 },
      { max: 10018, 0: 0.286, 1: 0.279, 2: 0.276, 3: 0.265, 4: 0.262, 5: 0.25 },
      { max: 12535, 0: 0.294, 1: 0.287, 2: 0.284, 3: 0.273, 4: 0.27, 5: 0.258 },
      {
        min: 12535,
        0: 0.302,
        1: 0.295,
        2: 0.292,
        3: 0.281,
        4: 0.278,
        5: 0.266,
      },
    ],
    CAS1: [
      { max: 659, 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 686, 0: 0.001, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 708, 0: 0.017, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 754, 0: 0.024, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 794, 0: 0.034, 1: 0.007, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 836, 0: 0.039, 1: 0.013, 2: 0.007, 3: 0, 4: 0, 5: 0 },
      { max: 886, 0: 0.046, 1: 0.027, 2: 0.009, 3: 0, 4: 0, 5: 0 },
      { max: 974, 0: 0.051, 1: 0.033, 2: 0.021, 3: 0, 4: 0, 5: 0 },
      { max: 1081, 0: 0.06, 1: 0.04, 2: 0.028, 3: 0.008, 4: 0, 5: 0 },
      { max: 1225, 0: 0.068, 1: 0.051, 2: 0.035, 3: 0.015, 4: 0.001, 5: 0 },
      { max: 1404, 0: 0.079, 1: 0.066, 2: 0.052, 3: 0.033, 4: 0.019, 5: 0.013 },
      { max: 1629, 0: 0.087, 1: 0.074, 2: 0.06, 3: 0.046, 4: 0.034, 5: 0.02 },
      { max: 1733, 0: 0.098, 1: 0.085, 2: 0.078, 3: 0.057, 4: 0.043, 5: 0.037 },
      { max: 1849, 0: 0.105, 1: 0.094, 2: 0.088, 3: 0.067, 4: 0.054, 5: 0.048 },
      { max: 1998, 0: 0.112, 1: 0.1, 2: 0.094, 3: 0.074, 4: 0.069, 5: 0.055 },
      { max: 2157, 0: 0.123, 1: 0.111, 2: 0.105, 3: 0.085, 4: 0.079, 5: 0.066 },
      { max: 2347, 0: 0.131, 1: 0.126, 2: 0.113, 3: 0.092, 4: 0.086, 5: 0.073 },
      { max: 2566, 0: 0.139, 1: 0.133, 2: 0.12, 3: 0.108, 4: 0.094, 5: 0.089 },
      { max: 2934, 0: 0.147, 1: 0.142, 2: 0.128, 3: 0.114, 4: 0.102, 5: 0.096 },
      { max: 3356, 0: 0.172, 1: 0.171, 2: 0.159, 3: 0.148, 4: 0.137, 5: 0.134 },
      { max: 3611, 0: 0.18, 1: 0.179, 2: 0.168, 3: 0.156, 4: 0.152, 5: 0.141 },
      { max: 3882, 0: 0.188, 1: 0.187, 2: 0.176, 3: 0.165, 4: 0.16, 5: 0.149 },
      { max: 4210, 0: 0.196, 1: 0.195, 2: 0.184, 3: 0.173, 4: 0.17, 5: 0.165 },
      { max: 4604, 0: 0.207, 1: 0.203, 2: 0.192, 3: 0.181, 4: 0.178, 5: 0.174 },
      { max: 5076, 0: 0.215, 1: 0.211, 2: 0.207, 3: 0.189, 4: 0.185, 5: 0.182 },
      { max: 5654, 0: 0.223, 1: 0.218, 2: 0.215, 3: 0.196, 4: 0.193, 5: 0.19 },
      { max: 6381, 0: 0.231, 1: 0.226, 2: 0.223, 3: 0.204, 4: 0.201, 5: 0.198 },
      { max: 7323, 0: 0.242, 1: 0.242, 2: 0.238, 3: 0.221, 4: 0.219, 5: 0.217 },
      { max: 8441, 0: 0.25, 1: 0.25, 2: 0.248, 3: 0.237, 4: 0.227, 5: 0.225 },
      { max: 9336, 0: 0.262, 1: 0.262, 2: 0.26, 3: 0.25, 4: 0.239, 5: 0.237 },
      { max: 10448, 0: 0.27, 1: 0.27, 2: 0.268, 3: 0.258, 4: 0.257, 5: 0.245 },
      {
        max: 14013,
        0: 0.281,
        1: 0.281,
        2: 0.276,
        3: 0.266,
        4: 0.265,
        5: 0.255,
      },
      {
        max: 20118,
        0: 0.297,
        1: 0.297,
        2: 0.295,
        3: 0.286,
        4: 0.285,
        5: 0.275,
      },
      {
        max: 22749,
        0: 0.305,
        1: 0.305,
        2: 0.303,
        3: 0.298,
        4: 0.293,
        5: 0.283,
      },
      {
        max: 25276,
        0: 0.313,
        1: 0.313,
        2: 0.311,
        3: 0.306,
        4: 0.304,
        5: 0.291,
      },
      {
        max: 28309,
        0: 0.321,
        1: 0.321,
        2: 0.319,
        3: 0.314,
        4: 0.312,
        5: 0.302,
      },
      { min: 28309, 0: 0.329, 1: 0.329, 2: 0.327, 3: 0.322, 4: 0.32, 5: 0.31 },
    ],
    'CAS1+DEF': [
      { max: 1650, 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 1753, 0: 0.006, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 1905, 0: 0.027, 1: 0.008, 2: 0.002, 3: 0, 4: 0, 5: 0 },
      { max: 1972, 0: 0.035, 1: 0.023, 2: 0.017, 3: 0.003, 4: 0, 5: 0 },
      { max: 2342, 0: 0.044, 1: 0.039, 2: 0.025, 3: 0.011, 4: 0, 5: 0 },
      { max: 2520, 0: 0.051, 1: 0.046, 2: 0.033, 3: 0.019, 4: 0.005, 5: 0 },
      { max: 2767, 0: 0.066, 1: 0.061, 2: 0.048, 3: 0.034, 4: 0.028, 5: 0.014 },
      { max: 2971, 0: 0.073, 1: 0.068, 2: 0.055, 3: 0.042, 4: 0.036, 5: 0.022 },
      { max: 3186, 0: 0.084, 1: 0.079, 2: 0.066, 3: 0.052, 4: 0.046, 5: 0.034 },
      { max: 3356, 0: 0.092, 1: 0.09, 2: 0.079, 3: 0.069, 4: 0.066, 5: 0.063 },
      { max: 3513, 0: 0.109, 1: 0.108, 2: 0.096, 3: 0.085, 4: 0.082, 5: 0.078 },
      { max: 3616, 0: 0.117, 1: 0.116, 2: 0.113, 3: 0.093, 4: 0.089, 5: 0.086 },
      { max: 3826, 0: 0.125, 1: 0.124, 2: 0.121, 3: 0.102, 4: 0.097, 5: 0.094 },
      { max: 3933, 0: 0.133, 1: 0.132, 2: 0.129, 3: 0.11, 4: 0.107, 5: 0.102 },
      { max: 4251, 0: 0.141, 1: 0.14, 2: 0.137, 3: 0.118, 4: 0.115, 5: 0.111 },
      { max: 4456, 0: 0.148, 1: 0.148, 2: 0.145, 3: 0.126, 4: 0.123, 5: 0.119 },
      { max: 4891, 0: 0.156, 1: 0.156, 2: 0.152, 3: 0.134, 4: 0.13, 5: 0.127 },
      { max: 5316, 0: 0.164, 1: 0.163, 2: 0.16, 3: 0.141, 4: 0.138, 5: 0.135 },
      { max: 5526, 0: 0.172, 1: 0.171, 2: 0.168, 3: 0.157, 4: 0.146, 5: 0.143 },
      { max: 5961, 0: 0.18, 1: 0.179, 2: 0.176, 3: 0.165, 4: 0.154, 5: 0.151 },
      { max: 6274, 0: 0.188, 1: 0.187, 2: 0.184, 3: 0.173, 4: 0.162, 5: 0.159 },
      { max: 6858, 0: 0.201, 1: 0.201, 2: 0.2, 3: 0.188, 4: 0.179, 5: 0.177 },
      { max: 7385, 0: 0.209, 1: 0.209, 2: 0.208, 3: 0.198, 4: 0.195, 5: 0.185 },
      { max: 8224, 0: 0.217, 1: 0.217, 2: 0.216, 3: 0.206, 4: 0.205, 5: 0.193 },
      { max: 9178, 0: 0.225, 1: 0.225, 2: 0.224, 3: 0.214, 4: 0.213, 5: 0.203 },
      {
        max: 10232,
        0: 0.237,
        1: 0.237,
        2: 0.236,
        3: 0.226,
        4: 0.225,
        5: 0.215,
      },
      {
        max: 11287,
        0: 0.245,
        1: 0.245,
        2: 0.244,
        3: 0.234,
        4: 0.233,
        5: 0.223,
      },
      {
        max: 13008,
        0: 0.257,
        1: 0.257,
        2: 0.256,
        3: 0.246,
        4: 0.245,
        5: 0.235,
      },
      {
        min: 13008,
        0: 0.265,
        1: 0.265,
        2: 0.264,
        3: 0.254,
        4: 0.253,
        5: 0.243,
      },
    ],
    CAS2: [
      { max: 659, 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 686, 0: 0.001, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 718, 0: 0.029, 1: 0.009, 2: 0.006, 3: 0.003, 4: 0, 5: 0 },
      { max: 739, 0: 0.051, 1: 0.031, 2: 0.018, 3: 0.005, 4: 0, 5: 0 },
      { max: 814, 0: 0.057, 1: 0.037, 2: 0.024, 3: 0.018, 4: 0.005, 5: 0 },
      { max: 922, 0: 0.072, 1: 0.053, 2: 0.046, 3: 0.028, 4: 0.022, 5: 0.009 },
      { max: 1005, 0: 0.081, 1: 0.062, 2: 0.056, 3: 0.037, 4: 0.032, 5: 0.022 },
      { max: 1065, 0: 0.091, 1: 0.071, 2: 0.064, 3: 0.045, 4: 0.036, 5: 0.03 },
      { max: 1143, 0: 0.099, 1: 0.086, 2: 0.079, 3: 0.059, 4: 0.053, 5: 0.04 },
      { max: 1225, 0: 0.106, 1: 0.094, 2: 0.086, 3: 0.067, 4: 0.06, 5: 0.047 },
      { max: 1321, 0: 0.113, 1: 0.108, 2: 0.095, 3: 0.08, 4: 0.067, 5: 0.061 },
      { max: 1424, 0: 0.12, 1: 0.114, 2: 0.102, 3: 0.089, 4: 0.075, 5: 0.069 },
      { max: 1562, 0: 0.128, 1: 0.123, 2: 0.109, 3: 0.097, 4: 0.083, 5: 0.076 },
      { max: 1711, 0: 0.139, 1: 0.133, 2: 0.12, 3: 0.107, 4: 0.101, 5: 0.088 },
      { max: 1870, 0: 0.151, 1: 0.146, 2: 0.133, 3: 0.121, 4: 0.115, 5: 0.102 },
      { max: 1977, 0: 0.158, 1: 0.154, 2: 0.14, 3: 0.127, 4: 0.121, 5: 0.109 },
      { max: 2090, 0: 0.171, 1: 0.168, 2: 0.154, 3: 0.139, 4: 0.133, 5: 0.127 },
      { max: 2218, 0: 0.179, 1: 0.175, 2: 0.162, 3: 0.149, 4: 0.141, 5: 0.136 },
      { max: 2367, 0: 0.186, 1: 0.183, 2: 0.178, 3: 0.156, 4: 0.15, 5: 0.143 },
      { max: 2535, 0: 0.194, 1: 0.19, 2: 0.184, 3: 0.165, 4: 0.159, 5: 0.152 },
      { max: 2767, 0: 0.202, 1: 0.198, 2: 0.192, 3: 0.172, 4: 0.166, 5: 0.16 },
      { max: 3104, 0: 0.219, 1: 0.215, 2: 0.208, 3: 0.186, 4: 0.181, 5: 0.175 },
      { max: 3534, 0: 0.231, 1: 0.23, 2: 0.227, 3: 0.208, 4: 0.205, 5: 0.202 },
      { max: 4118, 0: 0.241, 1: 0.241, 2: 0.235, 3: 0.224, 4: 0.213, 5: 0.21 },
      { max: 4650, 0: 0.255, 1: 0.252, 2: 0.249, 3: 0.236, 4: 0.225, 5: 0.222 },
      { max: 5194, 0: 0.263, 1: 0.26, 2: 0.257, 3: 0.246, 4: 0.241, 5: 0.229 },
      { max: 5880, 0: 0.27, 1: 0.268, 2: 0.265, 3: 0.254, 4: 0.251, 5: 0.237 },
      { max: 6727, 0: 0.29, 1: 0.289, 2: 0.284, 3: 0.278, 4: 0.277, 5: 0.275 },
      { max: 7939, 0: 0.298, 1: 0.297, 2: 0.295, 3: 0.286, 4: 0.285, 5: 0.283 },
      { max: 9560, 0: 0.314, 1: 0.313, 2: 0.311, 3: 0.302, 4: 0.301, 5: 0.299 },
      {
        max: 11282,
        0: 0.322,
        1: 0.321,
        2: 0.319,
        3: 0.314,
        4: 0.309,
        5: 0.307,
      },
      { max: 18854, 0: 0.33, 1: 0.329, 2: 0.327, 3: 0.322, 4: 0.32, 5: 0.315 },
      { max: 20221, 0: 0.338, 1: 0.337, 2: 0.335, 3: 0.33, 4: 0.328, 5: 0.323 },
      {
        max: 22749,
        0: 0.345,
        1: 0.345,
        2: 0.343,
        3: 0.338,
        4: 0.336,
        5: 0.333,
      },
      {
        max: 25276,
        0: 0.353,
        1: 0.353,
        2: 0.351,
        3: 0.346,
        4: 0.344,
        5: 0.342,
      },
      { min: 25276, 0: 0.361, 1: 0.361, 2: 0.359, 3: 0.354, 4: 0.352, 5: 0.35 },
    ],
    'CAS2+DEF': [
      { max: 1310, 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 1414, 0: 0.009, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 1455, 0: 0.027, 1: 0.021, 2: 0, 3: 0, 4: 0, 5: 0 },
      { max: 1639, 0: 0.034, 1: 0.028, 2: 0.014, 3: 0, 4: 0, 5: 0 },
      { max: 1956, 0: 0.049, 1: 0.043, 2: 0.031, 3: 0.017, 4: 0.011, 5: 0 },
      { max: 2079, 0: 0.06, 1: 0.055, 2: 0.041, 3: 0.028, 4: 0.023, 5: 0.017 },
      { max: 2213, 0: 0.074, 1: 0.062, 2: 0.056, 3: 0.042, 4: 0.03, 5: 0.024 },
      { max: 2314, 0: 0.096, 1: 0.083, 2: 0.07, 3: 0.056, 4: 0.049, 5: 0.043 },
      { max: 2479, 0: 0.111, 1: 0.098, 2: 0.084, 3: 0.071, 4: 0.058, 5: 0.051 },
      { max: 2561, 0: 0.118, 1: 0.106, 2: 0.1, 3: 0.086, 4: 0.073, 5: 0.067 },
      { max: 2663, 0: 0.126, 1: 0.113, 2: 0.107, 3: 0.093, 4: 0.081, 5: 0.074 },
      { max: 2929, 0: 0.134, 1: 0.121, 2: 0.115, 3: 0.102, 4: 0.088, 5: 0.082 },
      { max: 3247, 0: 0.147, 1: 0.137, 2: 0.134, 3: 0.123, 4: 0.112, 5: 0.109 },
      { max: 3585, 0: 0.156, 1: 0.146, 2: 0.143, 3: 0.132, 4: 0.121, 5: 0.118 },
      { max: 3718, 0: 0.164, 1: 0.156, 2: 0.151, 3: 0.14, 4: 0.137, 5: 0.126 },
      { max: 3933, 0: 0.172, 1: 0.163, 2: 0.16, 3: 0.148, 4: 0.145, 5: 0.134 },
      { max: 4353, 0: 0.184, 1: 0.175, 2: 0.172, 3: 0.161, 4: 0.156, 5: 0.145 },
      { max: 4620, 0: 0.192, 1: 0.183, 2: 0.18, 3: 0.169, 4: 0.166, 5: 0.161 },
      { max: 4916, 0: 0.2, 1: 0.191, 2: 0.188, 3: 0.177, 4: 0.174, 5: 0.17 },
      { max: 5204, 0: 0.207, 1: 0.199, 2: 0.196, 3: 0.185, 4: 0.182, 5: 0.178 },
      { max: 5634, 0: 0.215, 1: 0.207, 2: 0.204, 3: 0.193, 4: 0.189, 5: 0.186 },
      { max: 6064, 0: 0.227, 1: 0.218, 2: 0.215, 3: 0.204, 4: 0.201, 5: 0.198 },
      { max: 6768, 0: 0.242, 1: 0.235, 2: 0.234, 3: 0.224, 4: 0.223, 5: 0.221 },
      { max: 7236, 0: 0.25, 1: 0.245, 2: 0.242, 3: 0.232, 4: 0.231, 5: 0.229 },
      { max: 7817, 0: 0.258, 1: 0.253, 2: 0.251, 3: 0.24, 4: 0.239, 5: 0.237 },
      { max: 8500, 0: 0.266, 1: 0.261, 2: 0.259, 3: 0.25, 4: 0.246, 5: 0.245 },
      { max: 9284, 0: 0.274, 1: 0.269, 2: 0.267, 3: 0.258, 4: 0.256, 5: 0.253 },
      { max: 10018, 0: 0.286, 1: 0.281, 2: 0.279, 3: 0.27, 4: 0.268, 5: 0.266 },
      {
        max: 12535,
        0: 0.294,
        1: 0.289,
        2: 0.287,
        3: 0.278,
        4: 0.276,
        5: 0.274,
      },
      {
        min: 12535,
        0: 0.302,
        1: 0.297,
        2: 0.295,
        3: 0.286,
        4: 0.284,
        5: 0.282,
      },
    ],
  };

  $scope.init = function () {
    $scope.input.localizacao = $scope.localizacoes[0];
    $scope.input.situacao = $scope.situacoes[0];
    $scope.input.dependentes = $scope.dependentes[0];
    $scope.input.deficiente = false;
    $scope.input.refeicao_tipo = $scope.tipos_subsidio_refeicao[0];
    $scope.input.taxa_ss = 11;
    $scope.input.duodecimos_tipo = $scope.duodecimos[3];
    $scope.change();
  };

  $scope.change = function () {
    $scope.result = {};

    $scope.calculaVencimentoLiquido(
      $scope.input,
      $scope.getTabelaRetencao($scope.input),
      $scope.result
    );
  };

  $scope.calculaVencimentoLiquido = function (input, tabela, result) {
    if (!angular.isDefined(input)) {
      result.error_message = 'Erro geral no processamento de dados';
      return;
    }
    if (
      !angular.isDefined(input.localizacao) ||
      !angular.isDefined(input.localizacao.localizacao)
    ) {
      result.error_message = 'Erro no processamento da localização.';
      return;
    }
    if (
      !angular.isDefined(input.situacao) ||
      !angular.isDefined(input.situacao.situacao)
    ) {
      result.error_message = 'Erro no processamento da situacao.';
      return;
    }
    if (!angular.isDefined(tabela)) {
      result.error_message =
        'Erro a determinar a tabela de retenção na fonte aplicável.';
      return;
    }
    if (
      input.situacao.situacao == 'CAS1' &&
      !angular.isDefined(input.conjuge_deficiencia)
    ) {
      result.error_message =
        'Erro no processamento da indicação de deficiência para o cônjuge.';
      return;
    }
    if (
      !angular.isDefined(input.dependentes) ||
      !angular.isDefined(input.dependentes.numero)
    ) {
      result.error_message = 'Erro no processamento do número de dependentes.';
      return;
    }
    if (
      input.dependentes.numero > 0 &&
      !angular.isDefined(input.dependentes_deficiencia)
    ) {
      result.error_message =
        'Erro no processamento da indicação de dependentes com deficiência.';
      return;
    }
    if (!angular.isDefined(input.deficiente)) {
      result.error_message = 'Erro no processamento da situação de deficiente.';
      return;
    }
    if (
      angular.isDefined(input.base) &&
      (!isFinite(input.base) || input.base < 0)
    ) {
      result.error_message =
        'Por favor, indique um número positivo no campo do Vencimento base.';
      return;
    }
    if (
      angular.isDefined(input.extra) &&
      (!isFinite(input.extra) || input.extra < 0)
    ) {
      result.error_message =
        'Por favor, indique um número positivo no campo das Horas extraordinárias. Use o ponto como separador decimal, se for caso disso.';
      return;
    }
    if (
      angular.isDefined(input.outros_IRS_SS) &&
      (!isFinite(input.outros_IRS_SS) || input.outros_IRS_SS < 0)
    ) {
      result.error_message =
        'Por favor, indique um número positivo no campo Outros rendimentos suj. a IRS e SS. Use o ponto como separador decimal, se for caso disso.';
      return;
    }
    if (
      angular.isDefined(input.outros_IRS) &&
      (!isFinite(input.outros_IRS) || input.outros_IRS < 0)
    ) {
      result.error_message =
        'Por favor, indique um número positivo no campo Outros rendimentos só suj. a IRS. Use o ponto como separador decimal, se for caso disso.';
      return;
    }
    if (
      angular.isDefined(input.outros_isentos) &&
      (!isFinite(input.outros_isentos) || input.outros_isentos < 0)
    ) {
      result.error_message =
        'Por favor, indique um número positivo no campo Outros rendimentos isentos de IRS. Use o ponto como separador decimal, se for caso disso.';
      return;
    }
    if (
      !angular.isDefined(input.taxa_ss) ||
      !isFinite(input.taxa_ss) ||
      input.taxa_ss < 0 ||
      input.taxa_ss > 100
    ) {
      result.error_message =
        'Por favor, indique uma percentagem válida no campo da Taxa de Segurança Social. Use o ponto como separador decimal, se for caso disso.';
      return;
    }
    if (angular.isDefined(input.refeicao) && input.refeicao) {
      if (
        !angular.isDefined(input.refeicao_tipo) ||
        !angular.isDefined(input.refeicao_tipo.tipo)
      ) {
        result.error_message =
          'Erro no processamento do tipo de pagamento de subsídio de refeição.';
        return;
      }
      if (
        !angular.isDefined(input.refeicao_valor) ||
        !isFinite(input.refeicao_valor) ||
        input.refeicao_valor < 0
      ) {
        result.error_message =
          'Por favor, indique um número positivo no campo do Valor diário do subsídio de refeição. Use o ponto como separador decimal, se for caso disso.';
        return;
      }
      if (
        !angular.isDefined(input.refeicao_dias) ||
        input.refeicao_dias == null
      ) {
        return;
      }
      if (
        !Number.isInteger(input.refeicao_dias) ||
        input.refeicao_dias < 1 ||
        input.refeicao_dias > 31
      ) {
        result.error_message =
          'Por favor, indique um número inteiro, entre 1 e 31 no campo do número de Dias em que recebeu subsídio de refeição.';
        return;
      }
    }
    if (
      angular.isDefined(input.duodecimos_tipo) &&
      !angular.isDefined(input.duodecimos_tipo.tipo)
    ) {
      result.error_message =
        'Erro no processamento da opção de pagamento de duodécimos.';
      return;
    }

    result.notas = [];

    result.bruto = 0;
    result.bruto_coverflex = 0;
    result.tributavel = 0;
    result.tributavel_coverflex = 0;
    result.incidencia = 0;
    result.incidencia_coverflex = 0;
    result.subsidios = 0;
    result.subsidios_coverflex = 0;
    result.subsidio_refeicao = 0;
    result.subsidio_refeicao_coverflex = 0;
    result.extra_subsidio_refeicao = 0;
    result.duodecimos_retencao = 0;
    result.duodecimos_retencao_coverflex = 0;
    result.net_gain = 0;
    result.benefits_plan = 0;
    result.twelfth = 0;
    result.twelfth_coverflex = 0;

    if (input.base) {
      result.bruto += input.base + input.outros_IRS_SS;
      result.bruto_coverflex += input.base;

      result.twelfth = (result.bruto / 12) * 2;
      result.twelfth_coverflex = (result.bruto_coverflex / 12) * 2;

      result.tributavel += input.base + input.outros_IRS_SS;
      result.tributavel_coverflex += input.base;

      result.incidencia += input.base + input.outros_IRS_SS;
      result.incidencia_coverflex += input.base;

      //result.benefits_plan = input.outros_IRS_SS;
    }

    if (input.extra) {
      result.bruto += input.extra;
      result.bruto += input.extra;
      result.incidencia += input.extra;
      result.incidencia_coverflex += input.extra;
    }


    // alteração para suportar o não tenho subs alimentação
    if (input.refeicao_tipo.tipo != 'NAOTENHO') {
      result.bruto += input.refeicao_valor * input.refeicao_dias;
      result.bruto_coverflex += input.refeicao_valor * input.refeicao_dias;

      // resultado para aparecer na tabela
      if (input.refeicao_valor > input.refeicao_tipo.isento) {
        result.subsidio_refeicao = input.refeicao_tipo.isento * input.refeicao_dias;
        result.subsidio_refeicao_coverflex = input.refeicao_tipo.isento * input.refeicao_dias;
        result.extra_subsidio_refeicao = input.refeicao_valor * input.refeicao_dias - input.refeicao_tipo.isento * input.refeicao_dias;
        result.incidencia += result.extra_subsidio_refeicao;
        result.incidencia_coverflex += result.extra_subsidio_refeicao;
      } else{
        result.subsidio_refeicao = input.refeicao_valor * input.refeicao_dias;
        result.subsidio_refeicao_coverflex = input.refeicao_valor * input.refeicao_dias;
      }

      //result.subsidio_refeicao = result.subsidio_refeicao * 11; //11meses
      //console.log('result.subsidio_refeicao', result.subsidio_refeicao)
      result.tributavel += Math.max(input.refeicao_valor - input.refeicao_tipo.isento, 0) * input.refeicao_dias;
      result.tributavel_coverflex += Math.max(input.refeicao_valor - input.refeicao_tipo.isento, 0) * input.refeicao_dias;

      var half_benefits = (input.outros_IRS_SS * 14) / 12 / 2;
      result.bruto_coverflex += half_benefits;
      result.tributavel_coverflex += half_benefits;
      result.bruto_coverflex += half_benefits; //isento IRS e SS
      result.benefits_plan += half_benefits * 2;
    }else{
      console.log('input.outros_IRS_SS', input.outros_IRS_SS);
      console.log('input.refeicao_valor * input.refeicao_dias', (input.refeicao_valor * input.refeicao_dias));
      result.subsidio_refeicao_coverflex = input.outros_IRS_SS*14 < (input.refeicao_valor * input.refeicao_dias*11) ? (input.outros_IRS_SS*14)/11 : (input.refeicao_valor * input.refeicao_dias);
      console.log('result.subsidio_refeicao_coverflex', result.subsidio_refeicao_coverflex)

      result.bruto_coverflex += result.subsidio_refeicao_coverflex;

      var half_benefits = input.outros_IRS_SS * 14 > (input.refeicao_valor * input.refeicao_dias*11) ? ((input.outros_IRS_SS * 14)-(input.refeicao_valor * input.refeicao_dias*11)) / 12 / 2 : 0;

      result.bruto_coverflex += half_benefits;
      result.tributavel_coverflex += half_benefits;
      result.bruto_coverflex += half_benefits; //isento IRS e SS
      result.benefits_plan += half_benefits * 2;
    }
    /*
        if (input.outros_IRS_SS) {
            result.bruto += input.outros_IRS_SS;
            result.bruto_coverflex += input.outros_IRS_SS;
            result.tributavel += input.outros_IRS_SS;
            result.tributavel_coverflex += input.outros_IRS_SS;
            result.incidencia += input.outros_IRS_SS;
            result.incidencia_coverflex += input.outros_IRS_SS;
        }
        */

    if (input.outros_IRS) {
      result.bruto += input.outros_IRS;
      result.bruto_coverflex += input.outros_IRS;
      result.tributavel += input.outros_IRS;
      result.tributavel_coverflex += input.outros_IRS;
    }
    if (input.outros_isentos) {
      result.bruto += input.outros_isentos;
      result.bruto_coverflex += input.outros_isentos;
    }

    if (input.refeicao && input.refeicao_valor > input.refeicao_tipo.isento) {
      result.notas.push($scope.getNota('SubRef'));
    }
    var deps = input.dependentes.numero;
    if (input.dependentes.numero > 0 && input.dependentes_deficiencia) {
      deps = 5; //Como 5 é a coluna máxima, o facto de cada um valer por 5 acaba por significar que um dependente com deficiência é suficiente para saltar para o máximo de dependentes.
      result.notas.push($scope.getNota('DepDef=5Dep'));
    }
    if (input.situacao.situacao == 'CAS1' && input.conjuge_deficiencia) {
      deps = 5; //Como 5 é a coluna máxima, o facto de valer por 5 acaba por significar que um dependente com deficiência é suficiente para saltar para o máximo de dependentes.
      result.notas.push($scope.getNota('ConDef=5Dep'));
    }
    if (input.extra) {
      result.notas.push($scope.getNota('Extra'));
    }

    result.taxa = getTaxa(tabela, result.tributavel, deps);
    result.taxa_coverflex = getTaxa(tabela, result.tributavel_coverflex, deps);

    if (
      angular.isDefined(input.duodecimos_tipo) &&
      input.duodecimos_tipo != null &&
      input.duodecimos_tipo.tipo != 'NAOTENHO'
    ) {
      var calc_base = input.base + input.outros_IRS_SS;
      var calc_base_coverflex = input.base;
      result.taxa_de_duodecimos = getTaxa(tabela, calc_base, deps);
      result.taxa_de_duodecimos_coverflex = getTaxa(
        tabela,
        calc_base_coverflex,
        deps
      );
      var base = 0;
      var base_coverflex = 0;
      switch (input.duodecimos_tipo.tipo) {
        case '1x50%': {
          base = input.base / 2;
          result.duodecimos_retencao = Math.floor(
            (base / 12) * result.taxa_de_duodecimos
          );
          break;
        }
        case '2x50%': {
          base = input.base;
          result.duodecimos_retencao = Math.floor(
            (base / 12) * result.taxa_de_duodecimos
          );
          break;
        }
        case '2x100%': {
          base = calc_base * 2;
          base_coverflex = calc_base_coverflex * 2;
          result.duodecimos_retencao =
            (calc_base / 12) * result.taxa_de_duodecimos * 2;
          result.duodecimos_retencao_coverflex =
            (calc_base_coverflex / 12) *
            result.taxa_de_duodecimos_coverflex *
            2;
          break;
        }
      }

      result.subsidios = base / 0.12 / 100;
      result.subsidios_coverflex = base_coverflex / 0.12 / 100;

      result.incidencia += result.subsidios;
      result.incidencia_coverflex += result.subsidios_coverflex;
    }

    result.retencao = result.tributavel * result.taxa;
    result.retencao_coverflex =
      result.tributavel_coverflex * result.taxa_coverflex;

    if (result.duodecimos_retencao) {
      result.retencao += result.duodecimos_retencao;
      result.retencao_coverflex += result.duodecimos_retencao_coverflex;
    }

    result.seg_social = Math.round(result.incidencia * input.taxa_ss) / 100;
    result.seg_social_coverflex =
      Math.round(result.incidencia_coverflex * input.taxa_ss) / 100;

    result.valor_liquido =
      Math.round(
        (result.bruto -
          result.retencao -
          result.seg_social +
          result.subsidios) *
          100
      ) / 100;
    result.valor_liquido_coverflex =
      Math.round(
        (result.bruto_coverflex -
          result.retencao_coverflex -
          result.seg_social_coverflex +
          result.subsidios_coverflex) *
          100
      ) / 100;

    result.total_taxas =
      Math.round((result.retencao + result.seg_social) * 100) / 100;
    result.total_taxas_coverflex =
      Math.round(
        (result.retencao_coverflex + result.seg_social_coverflex) * 100
      ) / 100;

    //console.log('result.total_taxas', result.total_taxas)
    //console.log('result.total_taxas_coverflex', result.total_taxas_coverflex)

    result.net_gain = (result.total_taxas - result.total_taxas_coverflex) * 12;

    // novo campo do custo total para empresa;
    result.custo_total_empresa =
      result.incidencia * empresa_taxa_ss_social +
      result.subsidio_refeicao +
      input.outros_IRS +
      input.outros_isentos;
    result.custo_total_empresa_coverflex =
      result.incidencia_coverflex * empresa_taxa_ss_social +
      result.subsidio_refeicao_coverflex +
      result.benefits_plan;
    //	Old version: result.custo_total_empresa = ((input.base + input.outros_IRS_SS  +  result.subsidios + result.extra_subsidio_refeicao)  * empresa_taxa_ss_social) + result.subsidio_refeicao +  input.outros_IRS + input.outros_isentos;

    if (angular.isDefined(input.extra)) {
      result.retencao_extra = Math.floor(input.extra * result.taxa);
      result.valor_liquido -= result.retencao_extra;
    }
    if (
      angular.isDefined(input.duodecimos_tipo) &&
      input.duodecimos_tipo != null &&
      input.duodecimos_tipo.tipo != 'NAOTENHO'
    ) {
      result.taxa_subsidios = getTaxa(tabela, result.subsidios, deps);
      result.retencao_subsidios = Math.floor(
        input.extra * result.taxa_subsidios
      );
      result.valor_liquido -= result.retencao_subsidios;
    }
  };

  getTaxa = function (tabela, valor, dependentes) {
    for (i = 0; i < tabela.length; i++) {
      rng = tabela[i];
      if (angular.isDefined(rng.max)) {
        if (rng.max < valor) continue;
      } else if (angular.isDefined(rng.min)) {
        if (rng.min > valor) continue;
      }
      return rng[dependentes];
    }
  };

  $scope.getTabelaRetencao = function (input) {
    var index1 = input.localizacao.localizacao;
    var index2 = input.situacao.situacao + (input.deficiente ? '+DEF' : '');
    return $scope.taxas_retencao[index1][index2];
  };

  $scope.getReferenciaNota = function (id) {
    var nota = $scope.getNota(id);
    if (nota) return nota.referencia;
    return id;
  };
  $scope.getDescricaoNota = function (id) {
    var nota = $scope.getNota(id);
    if (nota) return nota.descricao;
    return id;
  };
  $scope.getNota = function (id) {
    for (i = 0; i < $scope.notas.length; i++) {
      if (id == $scope.notas[i].id) {
        return $scope.notas[i];
      }
    }
    return null;
  };
}

if (app.cp) {
  app.cp.register('salarioLiquidoCtrl', SalarioLiquidoCtrl);
} else {
  app.controller('salarioLiquidoCtrl', SalarioLiquidoCtrl);
}