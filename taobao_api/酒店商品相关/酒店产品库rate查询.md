taobao.xhotel.rate.get( 酒店产品库rate查询 )

[￥开放平台免费API](https://open.taobao.com/v2/doc#/abilityToOpen?docType=1&docId=104559&treeId=775)[必须用户授权](https://open.taobao.com/v2/doc#/abilityToOpen?docId=121222&docType=1)

酒店产品库rate查询

## 公共参数

请求地址:

| 环境     | HTTP地址                             | HTTPS地址                          |
| :------- | :----------------------------------- | :--------------------------------- |
| 正式环境 | http://gw.api.taobao.com/router/rest | https://eco.taobao.com/router/rest |

公共请求参数:

| 名称        | 类型    | 必须 | 描述                                                         |
| :---------- | :------ | :--- | :----------------------------------------------------------- |
| method      | String  | 是   | API接口名称，例如:taobao.xhotel.rate.get                     |
| app_key     | String  | 是   | TOP分配给应用的AppKey，例如：12345678                        |
| session     | String  | 否   | 用户登录授权成功后，TOP颁发给应用的授权信息，详细介绍请[点击这里](http://open.taobao.com/docs/doc.htm?docType=1&articleId=102635&treeId=1)。当此API的标签上注明：“需要授权”，则此参数必传；“不需要授权”，则此参数不需要传；“可选授权”，则此参数为可选 |
| timestamp   | String  | 是   | 时间戳，格式为yyyy-MM-dd HH:mm:ss，时区为GMT+8，例如：2015-01-01 12:00:00。淘宝API服务端允许客户端请求最大时间误差为10分钟 |
| v           | String  | 是   | API协议版本，可选值：2.0                                     |
| sign_method | String  | 是   | 签名的摘要算法，可选值为：hmac，md5，hmac-sha256。           |
| sign        | String  | 是   | API输入参数签名结果，签名算法介绍请[点击这里](http://open.taobao.com/docs/doc.htm?articleId=101617&docType=1&treeId=1) |
| format      | String  | 否   | 响应格式。默认为xml格式，可选值：xml，json。                 |
| simplify    | Boolean | 否   | 是否采用精简JSON返回格式，仅当format=json时有效，默认值为：false |

公共响应参数:

| 名称           | 类型   | 描述                                              |
| :------------- | :----- | :------------------------------------------------ |
| request_id     | String | 平台颁发的每次请求访问的唯一标识                  |
| error_response | String | 请求访问失败时返回的根节点                        |
| code           | String | 请求失败返回的错误码                              |
| msg            | String | 请求失败返回的错误信息                            |
| sub_code       | String | 请求失败返回的子错误码                            |
| sub_msg        | String | 请求失败返回的子错误信息                          |
| ***_response   | String | 请求成功返回的根节点，'***' 为API名称的下划线模式 |

## 请求参数

| 名称             | 类型     | 必须    | 示例值         | 描述                                             |
| -------------- | ------ | ----- | ----------- | ---------------------------------------------- |
| gid            | Number | false | 100000      | gid酒店商品id                                      |
| rpid           | Number | false | 100000      | 酒店RPID                                         |
| vendor         | String | false | ChinaOnline | 用于标示该宝贝的售卖渠道信息，允许同一个卖家酒店房型在淘宝系统发布多个售卖渠道的宝贝的价格。 |
| rateplan\_code | String | false | 12345AAA    | 卖家自己系统的Code，简称RateCode                         |
| out\_rid       | String | false | 12345AAA    | 卖家房型ID, 这是卖家自己系统中的房型ID 注意：需要按照规则组合             |
| rate\_id       | Number | false | 112221      | RateID                                         |

## 返回参数
| 名称                          | 类型       | 示例值                                                                                                                                                                                                                       | 描述                                                                                                                                                                                                                                                                                                                                      |
| --------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **rate**                    | **Rate** |                                                                                                                                                                                                                           | **rate**                                                                                                                                                                                                                                                                                                                                |
| ├─ gid                      | Number   | 123456                                                                                                                                                                                                                    | 酒店商品id                                                                                                                                                                                                                                                                                                                                  |
| ├─ rpid                     | Number   | 123456                                                                                                                                                                                                                    | 酒店RPID                                                                                                                                                                                                                                                                                                                                  |
| ├─ name                     | String   | aaa                                                                                                                                                                                                                       | 名称                                                                                                                                                                                                                                                                                                                                      |
| ├─ inventory\_price         | String   | {"use\_room\_inventory":false,inventory\_price:\[{"date":2014-01-28,"quota":10,"price":100},{"date":2014-01-29,"quota":10,"price":200}]}                                                                                  | 价格和库存信息。A:use\_room\_inventory:是否使用room级别共享库存，可选值 true false 1、true时：使用room级别共享库存（即使用gid对应的XRoom中的inventory），rate\_quota\_map 的json 数据中不需要录入库存信息,录入的库存信息会忽略 2、false时：使用rate级别私有库存，此时要求价格和库存必填。B:date 日期必须为 T---T+90 日内的日期（T为当天），且不能重复 C:price 价格 int类型 取值范围1-99999999 单位为分 D:quota 库存 int 类型 取值范围 0-999（数量库存） 60000(状态库存关) 61000(状态库存开) |
| ├─ add\_bed                 | Number   | 1                                                                                                                                                                                                                         | 额外服务-是否可以加床，1：不可以，2：可以                                                                                                                                                                                                                                                                                                                  |
| ├─ add\_bed\_price          | Number   | 222                                                                                                                                                                                                                       | 额外服务-加床价格                                                                                                                                                                                                                                                                                                                               |
| ├─ currency\_code           | Number   | 123456                                                                                                                                                                                                                    | 币种（仅支持CNY）                                                                                                                                                                                                                                                                                                                              |
| ├─ shijia\_tag              | Number   | 1                                                                                                                                                                                                                         | 实价有房标签（RP支付类型为全额支付）                                                                                                                                                                                                                                                                                                                     |
| ├─ jishiqueren\_tag         | Number   | 1                                                                                                                                                                                                                         | 即时确认状态，表示此rate预订后是否可以直接发货。可取范围：0,1。可以为空                                                                                                                                                                                                                                                                                                 |
| ├─ created\_time            | Date     | 2000-01-01 00:00:00                                                                                                                                                                                                       | 创建时间                                                                                                                                                                                                                                                                                                                                    |
| ├─ modified\_time           | Date     | 2000-01-01 00:00:00                                                                                                                                                                                                       | 修改时间                                                                                                                                                                                                                                                                                                                                    |
| ├─ use\_room\_inventory     | Boolean  | false                                                                                                                                                                                                                     | 是否使用RoomInventory库存 仅当Rate上使用时有意义                                                                                                                                                                                                                                                                                                       |
| ├─ inv\_price\_with\_switch | String   | \[ { "alQuota": 43, "date": "2017-07-22", "price": 1200, "genAlQuota":31, "quota": 12, "rateSwitch": false }, { "alQuota": 43, "date": "2017-07-23", "price": 1200, "quota": 12, "genAlQuota":11, "rateSwitch": false } ] | 结构化的库存和开关, date 日期 price 价格 int 类型, 取值范围1-99999999 单位为分 quota 普通库存 int 类型 取值范围 0-999（数量库存） 60000(状态库存关) 61000(状态库存开) alQuota 协议保留房库存 int 类型 取值范围 0-999（数量库存） 60000(状态库存关) 61000(状态库存开)                                                                                                                                                  |


## 请求示例

NodeJS

```node
TopClient = require('./topClient').TopClient;
var client = new TopClient({
	'appkey': 'appkey',
	'appsecret': 'secret',
	'url': 'http://gw.api.taobao.com/router/rest'
});

client.execute('taobao.xhotel.rate.get', {
	'gid':'100000',
	'rpid':'100000',
	'vendor':'ChinaOnline',
	'rateplan_code':'12345AAA',
	'out_rid':'12345AAA',
	'rate_id':'112221'
}, function(error, response) {
	if (!error) console.log(response);
	else console.log(error);
})
```

## 响应示例

XML

JSON

```
{
    "xhotel_rate_get_response":{
        "rate":{
            "gid":123456,
            "rpid":123456,
            "name":"aaa",
            "inventory_price":"{\"use_room_inventory\":false,inventory_price:[{\"date\":2014-01-28,\"quota\":10,\"price\":100},{\"date\":2014-01-29,\"quota\":10,\"price\":200}]}",
            "add_bed":1,
            "add_bed_price":222,
            "currency_code":123456,
            "shijia_tag":1,
            "jishiqueren_tag":1,
            "created_time":"2000-01-01 00:00:00",
            "modified_time":"2000-01-01 00:00:00",
            "use_room_inventory":false,
            "inv_price_with_switch":"[   {     \"alQuota\": 43,     \"date\": \"2017-07-22\",     \"price\": 1200,     \"genAlQuota\":31,     \"quota\": 12,     \"rateSwitch\": false   },   {     \"alQuota\": 43,     \"date\": \"2017-07-23\",     \"price\": 1200,     \"quota\": 12,     \"genAlQuota\":11,     \"rateSwitch\": false   } ]",
            "tag_json":"{\"ebk-tail-room-Rate\":1}"
        }
    }
}
```

## 异常示例

XML

JSON

```
{
	"error_response":{
		"msg":"Remote service error",
		"code":50,
		"sub_msg":"非法参数",
		"sub_code":"isv.invalid-parameter"
	}
}
```

## 错误码解释

| 错误码                                    | 错误消息                     | 解决方案                         |
| :---------------------------------------- | :--------------------------- | :------------------------------- |
| isv.invalid-parameter:FORMAT_ERROR        | 参数格式不正确               | 请检查输入参数                   |
| isv.invalid-parameter:ERROR               | 参数不正确                   | 请检查输入参数                   |
| isv.permission-error:NO_PERMISSIONS_ERROR | 权限不够、非法访问           | 请申请权限或者使用正确的账号操作 |
| isv.invalid-parameter: RATE_REPEAT_ERROR  | 定价信息已经存在             | 请不要重复添加定价信息           |
| isv.biz-error: RATEPLAN_NOT_EXIST_ERROR   | 定价信息关联的价格计划不存在 | 请检查输入参数                   |
| isv.biz-error:BIZ_ERROR                   | 业务异常                     | 请稍后重试                       |
| isv.biz-error: INVENTORY_NOT_EXSIT_ERROR  | 库存不存在                   | 请检查输入参数                   |
| isv.invalid-parameter:NOTNULL             | 参数不能为空                 | 参数不能为空                     |
| isv.remote-service:CONVERT_ERROR          | 转换对象时出错               | 请检查输入参数                   |